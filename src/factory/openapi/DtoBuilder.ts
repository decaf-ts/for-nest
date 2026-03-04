import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { ApiProperty } from "../../overrides/decoration";
import { Model, ValidationKeys } from "@decaf-ts/decorator-validation";
import { TransactionOperationKeys } from "@decaf-ts/core";
import { toPascalCase } from "@decaf-ts/logging";
import { DECORATORS } from "../../overrides/constants";

const dtoCache = new Map<
  OperationKeys,
  WeakMap<Constructor<any>, Constructor<any>>
>();

/**
 * Builds a Nest/Swagger DTO class for the given model and CRUD operation.
 *
 * Rules:
 *  - Only CREATE and UPDATE (and their bulk variants) produce a DTO;
 *    all other operations return the original model class unchanged.
 *  - @generated() properties (createdAt, updatedAt, createdBy, updatedBy,
 *    uuid, version, @composed pks, …) are **never** exposed in any DTO.
 *  - The @pk() property:
 *      • UPDATE – always included.
 *      • CREATE  – included only when the pk is NOT auto-generated
 *                  (checked via Model.pkProps().generated AND Model.generated()).
 *  - Relation properties (@oneToOne, @oneToMany, …):
 *      • CREATE  – nested as DtoFor(CREATE, RelatedModel).
 *      • UPDATE  – union of DtoFor(UPDATE, RelatedModel) **or** the
 *                  related model's primary-key type (string / integer),
 *                  expressed as a Swagger oneOf.
 *
 * Metadata.properties() now returns ALL properties across the prototype chain,
 * so DTO inheritance is no longer needed; every DTO is a flat class.
 */
export function DtoFor<M extends Model>(
  op: OperationKeys,
  model: Constructor<M>
): Constructor<any> {
  if (!TransactionOperationKeys.includes(op)) {
    return model;
  }

  const cache = getDtoCache(op);
  const cached = cache.get(model);
  if (cached) return cached;

  const isUpdateOp = [
    OperationKeys.UPDATE,
    BulkCrudOperationKeys.UPDATE_ALL,
  ].includes(op as any);

  class DynamicDTO {}
  cache.set(model, DynamicDTO);

  Object.defineProperty(DynamicDTO, "name", {
    value: `${toPascalCase(model.name)}${toPascalCase(op)}DTO`,
  });

  const pkProp = (() => {
    try {
      return Model.pk(model);
    } catch {
      return undefined;
    }
  })();

  const pkPropsMetadata = pkProp ? Model.pkProps(model as any) : undefined;
  const pkDesignType = pkProp
    ? Reflect.getMetadata("design:type", model.prototype, pkProp as string)
    : undefined;
  const pkTypeIsNumeric =
    pkDesignType === Number || pkDesignType === BigInt;
  const pkIsGenerated =
    !!pkPropsMetadata?.generated ||
    (pkProp
      ? Model.generatedBySequence(model as any, pkProp as any) ||
        isPropertyGeneratedAcrossInheritance(model, pkProp as string) ||
        pkTypeIsNumeric
      : false);

  const allProps = Array.from(new Set(Metadata.properties(model) || []));
  const relations = new Set<string>((Model.relations(model) as string[]) || []);
  const scalarProps: string[] = [];

  for (const prop of allProps) {
    if (!prop) continue;
    if (relations.has(prop)) continue;

    if (prop === pkProp && !isUpdateOp && pkIsGenerated) continue;
    if (prop !== pkProp && isPropertyGeneratedAcrossInheritance(model, prop))
      continue;

    scalarProps.push(prop);
  }

  for (const prop of scalarProps) {
    const validation = getValidationAcrossInheritance(model, prop);
    const isRequired = !!validation?.[ValidationKeys.REQUIRED];
    const typeHint =
      getTypeAcrossInheritance(model, prop) ??
      Reflect.getMetadata("design:type", model.prototype, prop);

    const apiOptions: Parameters<typeof ApiProperty>[0] = {
      required: isRequired,
    };
    if (typeHint) apiOptions.type = typeHint;

    ApiProperty(apiOptions)(DynamicDTO.prototype, prop);

    const designType =
      Reflect.getMetadata("design:type", model.prototype, prop) ?? typeHint;
    if (typeof designType !== "undefined") {
      Reflect.defineMetadata(
        "design:type",
        designType,
        DynamicDTO.prototype,
        prop
      );
    }

    Object.defineProperty(DynamicDTO.prototype, prop, {
      value: undefined,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  for (const relation of relations) {
    const relationMeta = Metadata.relations(model, relation as any);
    if (!relationMeta) {
      throw new InternalError(`Metadata for relation ${relation} not found`);
    }

    let relationType: Constructor<any> | undefined =
      relationMeta.class as Constructor<any>;
    if (typeof relationType === "function" && !relationType.name) {
      relationType = (relationType as any)();
    }
    if (!relationType || typeof relationType !== "function") {
      throw new InternalError(`Type for relation ${relation} not found`);
    }
    if (!Model.get(relationType.name)) {
      continue;
    }

    const meta = Metadata.validationFor(model, relation as any);
    const isArray = !!(meta as any)?.[ValidationKeys.LIST];
    const isRequired = !!(meta as any)?.[ValidationKeys.REQUIRED];
    const relationDto = DtoFor(op, relationType);

    if (isUpdateOp) {
      addRelationUpdate(
        DynamicDTO,
        relation,
        relationType,
        relationDto,
        isArray,
        isRequired
      );
    } else {
      addRelation(DynamicDTO, relation, relationDto, isArray, isRequired);
    }
  }

  return DynamicDTO;
}

function addRelation(
  DtoClass: any,
  relation: string,
  relationDto: any,
  isArray: boolean,
  isRequired: boolean
): void {
  const apiOptions: Parameters<typeof ApiProperty>[0] = {
    type: relationDto,
    required: isRequired,
    isArray,
  };
  ApiProperty(apiOptions)(DtoClass.prototype, relation);
  Reflect.defineMetadata(
    "design:type",
    isArray ? Array : relationDto,
    DtoClass.prototype,
    relation
  );
  Object.defineProperty(DtoClass.prototype, relation, {
    value: undefined,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function addRelationUpdate(
  DtoClass: any,
  relation: string,
  relationType: Constructor<any>,
  relationDto: any,
  isArray: boolean,
  isRequired: boolean
): void {
  const extraModels =
    Reflect.getMetadata(DECORATORS.API_EXTRA_MODELS, DtoClass) || [];
  if (!extraModels.includes(relationDto)) {
    Reflect.defineMetadata(
      DECORATORS.API_EXTRA_MODELS,
      [...extraModels, relationDto],
      DtoClass
    );
  }

  const dtoRef = `#/components/schemas/${relationDto.name}`;
  const pkTypeName = getPkOpenApiType(relationType);
  const oneOfItems = [{ $ref: dtoRef }, { type: pkTypeName }];

  const apiOptions: Parameters<typeof ApiProperty>[0] = isArray
    ? ({ type: "array", required: isRequired, oneOf: oneOfItems } as any)
    : ({ type: Object, required: isRequired, oneOf: oneOfItems } as any);

  ApiProperty(apiOptions)(DtoClass.prototype, relation);
  Reflect.defineMetadata(
    "design:type",
    isArray ? Array : Object,
    DtoClass.prototype,
    relation
  );
  Object.defineProperty(DtoClass.prototype, relation, {
    value: undefined,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function getPkOpenApiType(relationType: Constructor<any>): string {
  try {
    const pkPropsMetadata = Model.pkProps(relationType as any);
    const pkType = pkPropsMetadata?.type;
    if (pkType === Number || pkType === BigInt) return "integer";
    return "string";
  } catch {
    return "string";
  }
}

function isPropertyGeneratedAcrossInheritance(
  model: Constructor<any>,
  prop: string
): boolean {
  let current: any = model;
  while (current && current !== Object && current !== Function) {
    if (Model.generated(current, prop as any)) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

function getValidationAcrossInheritance(
  model: Constructor<any>,
  prop: string
): Record<string, any> | undefined {
  let current: any = model;
  while (current && current !== Object && current !== Function) {
    const validation = Metadata.validationFor(current, prop as any);
    if (validation) return validation as any;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function getTypeAcrossInheritance(model: Constructor<any>, prop: string): any {
  let current: any = model;
  while (current && current !== Object && current !== Function) {
    const type = Metadata.type(current, prop);
    if (type) return type;
    current = Object.getPrototypeOf(current);
  }
  return undefined;
}

function getDtoCache(
  op: OperationKeys
): WeakMap<Constructor<any>, Constructor<any>> {
  if (!dtoCache.has(op)) {
    dtoCache.set(op, new WeakMap());
  }
  return dtoCache.get(op)!;
}
