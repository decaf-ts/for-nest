import { InternalError, OperationKeys } from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { ApiProperty } from "../../overrides/decoration";
import { Model, ValidationKeys } from "@decaf-ts/decorator-validation";
import { PersistenceKeys, TransactionOperationKeys } from "@decaf-ts/core";
import { PickType } from "@nestjs/swagger";
import { toPascalCase } from "@decaf-ts/logging";

const dtoCache = new Map<
  OperationKeys,
  WeakMap<Constructor<any>, Constructor<any>>
>();

// export function toCache(){
//   const cacheableProps: Record<keyof M, any> = Metadata.get(
//     model.constructor as Constructor,
//     PTPKeys.CACHE
//   );
//   if (!cacheableProps)
//     throw new InternalError("No cacheable properties defined for this model.");
//   try {
//     const cacheData: Record<keyof M, any> = {} as any;
//     for (const key of Object.keys(cacheableProps) as (keyof M)[]) {
//       if (
//         (model[key] as any) instanceof Model &&
//         (model[key] as ICacheable).toCache
//       ) {
//         cacheData[key] = (model[key] as ICacheable).toCache();
//       } else if (
//         Array.isArray(model[key]) &&
//         model[key].length &&
//         model[key].every(
//           (m) => m instanceof Model && (m as unknown as ICacheable).toCache
//         )
//       ) {
//         cacheData[key] = (model[key] as unknown as ICacheable[]).map((m) =>
//           m.toCache()
//         );
//       } else cacheData[key] = model[key];
//     }
//     return (stringify ? JSON.stringify(cacheData) : cacheData) as any;
// }

export function DtoFor<M extends Model>(
  op: OperationKeys,
  model: Constructor<M>
) {
  if (!TransactionOperationKeys.includes(op)) {
    return model;
  }
  const cache = getDtoCache(op);
  const cached = cache.get(model);
  if (cached) return cached;
  const attributeProps = Metadata.getAttributes(model) || [];
  const schemaProps = collectSchemaProperties(model);
  const createdByMetadata = Metadata.get(model, PersistenceKeys.CREATED_BY);
  const updatedByMetadata = Metadata.get(model, PersistenceKeys.UPDATED_BY);
  const metadataOwnershipProps = [
    ...Object.keys(createdByMetadata || {}),
    ...Object.keys(updatedByMetadata || {}),
  ];
  const manualOwnershipProps = ["createdBy", "updatedBy"].filter(
    (prop) => schemaProps.includes(prop) || attributeProps.includes(prop)
  );
  const ownershipProps = Array.from(
    new Set([...metadataOwnershipProps, ...manualOwnershipProps])
  );
  const props = Array.from(
    new Set([...schemaProps, ...attributeProps, ...ownershipProps])
  );
  const relations = collectRelations(model);
  const relationProps = new Set(relations);
  const generatedProps = props.filter((prop) =>
    isGeneratedAcrossInheritance(model, prop as any)
  );
  const exceptions = new Set([...generatedProps, ...ownershipProps]);
  const allowedProps = props.filter(
    (prop) => !exceptions.has(prop) && !relationProps.has(prop)
  );

  class DynamicDTO extends PickType(model as any, allowedProps as any) {}
  cache.set(model, DynamicDTO);

  Object.defineProperty(DynamicDTO, "name", {
    value: `${toPascalCase(model.name)}${toPascalCase(op)}DTO`,
  });

  for (const ancestor of collectInheritance(model)) {
    if (Model.isModel(ancestor)) {
      DtoFor(op, ancestor);
    }
  }

  for (const prop of props) {
    if (exceptions.has(prop)) continue;
    if (relationProps.has(prop)) continue;
    const validation = Metadata.validationFor(model, prop as any);
    const isRequired = !!validation?.[ValidationKeys.REQUIRED];
    const typeHint = Metadata.type(model, prop as any);
    const apiOptions: Parameters<typeof ApiProperty>[0] = {
      required: isRequired,
    };
    if (typeHint) {
      apiOptions.type = typeHint;
    }
    ApiProperty(apiOptions)(DynamicDTO.prototype, prop);
  }

  function addRelation(
    relation: string,
    relationDto: any,
    isArray: boolean,
    isRequired: boolean
  ) {
    const apiOptions: Parameters<typeof ApiProperty>[0] = {
      type: relationDto,
      required: isRequired,
      isArray,
    };
    ApiProperty(apiOptions)(DynamicDTO.prototype, relation);
    Object.defineProperty(DynamicDTO.prototype, relation, {
      value: undefined,
      writable: true,
      enumerable: true,
      configurable: true,
    });
    Reflect.defineMetadata(
      "design:type",
      isArray ? Array : relationDto,
      DynamicDTO.prototype,
      relation
    );
  }

  // Add processed relations back to the DTO
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
    const relationDto = DtoFor(op, relationType);
    const isArray = !!(meta as any)[ValidationKeys.LIST];
    addRelation(
      relation,
      relationDto,
      isArray,
      !!(meta as any)[ValidationKeys.REQUIRED]
    );
  }

  return DynamicDTO;
}

function collectInheritance(model: Constructor<any>) {
  const ancestors: Constructor<any>[] = [];
  let current: any = Object.getPrototypeOf(model);

  while (current && current !== Object && current !== Function) {
    ancestors.push(current);
    current = Object.getPrototypeOf(current);
  }

  return ancestors.reverse();
}

function collectRelations(model: Constructor<any>) {
  const collected = new Set<string>();
  let current: any = model;

  while (current && current !== Object && current !== Function) {
    const relationKeys = Model.relations(current) || [];
    relationKeys.forEach((key) => collected.add(key));
    current = Object.getPrototypeOf(current);
  }

  return Array.from(collected);
}

function isGeneratedAcrossInheritance(model: Constructor<any>, prop: string) {
  let current: any = model;

  while (current && current !== Object && current !== Function) {
    if (Model.generated(current, prop as any)) return true;
    current = Object.getPrototypeOf(current);
  }

  return false;
}

function collectSchemaProperties(model: Constructor<any>) {
  const collected = new Set<string>();
  let current: any = model;

  while (current && current !== Object && current !== Function) {
    const metadata = Metadata.get(current);
    const props = metadata?.properties ? Object.keys(metadata.properties) : [];
    props.forEach((prop) => collected.add(prop));
    current = Object.getPrototypeOf(current);
  }

  return Array.from(collected);
}

function getDtoCache(op: OperationKeys) {
  if (!dtoCache.has(op)) {
    dtoCache.set(op, new WeakMap());
  }
  return dtoCache.get(op)!;
}
