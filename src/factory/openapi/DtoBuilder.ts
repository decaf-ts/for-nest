import {
  BulkCrudOperationKeys,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Model, ValidationKeys } from "@decaf-ts/decorator-validation";
import { TransactionOperationKeys } from "@decaf-ts/core";
import { ApiProperty, ApiPropertyOptional, PickType } from "@nestjs/swagger";
import { toPascalCase } from "@decaf-ts/logging";

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
  const isUpdate = [
    OperationKeys.UPDATE,
    BulkCrudOperationKeys.UPDATE_ALL,
  ].includes(op);
  const props = Metadata.properties(model) || [];
  const relations = Model.relations(model) || [];
  let exceptions = props.filter(
    (p) => Model.generated(model, p as any) || relations.includes(p)
  );

  if (isUpdate)
    exceptions = exceptions.filter(
      (p) => p !== Model.pk(model) || Model.pkProps(model).generated
    );

  const dto = class DynamicDTO extends PickType(model, exceptions as any[]) {};

  if (!dto)
    throw new InternalError(
      `Failed to create DTO for model ${model.name} with operation ${op}`
    );

  function addRelation(relation: string, relationDto: any, isArray: boolean) {
    const result = isArray ? [relationDto] : relationDto;

    if (!isArray) {
      Object.defineProperty(dto.prototype, relation, {
        value: result,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else {
      // // Swagger: tell it the element type
      // ApiProperty({
      //   type: [relationDto],
      // })(dto.prototype, relation);
    }
    Reflect.defineMetadata(
      "design:type",
      isArray ? Array : relationDto,
      dto.prototype,
      relation
    );
  }
  //
  // // Add processed relations back to the DTO
  // for (const relation of relations) {
  //   let type: any[] | any = Metadata.allowedTypes(model, relation as any);
  //   type = type ? (Array.isArray(type) ? type[0] : type) : undefined;
  //   type = typeof type === "function" && !type.name ? type() : type;
  //
  //   if (!type) {
  //     throw new InternalError(`Type for relation ${relation} not found`);
  //   }
  //   if (Model.get(type.name)) {
  //     const meta = Metadata.validationFor(model, relation as any);
  //     const relationDto = DtoFor(op, type);
  //     addRelation(relation, relationDto, !!(meta as any)[ValidationKeys.LIST]);
  //   }
  // }

  Object.assign(dto, "name", {
    value: `${toPascalCase(model.name)}${toPascalCase(op)}DTO`,
  });
  return dto;
}
