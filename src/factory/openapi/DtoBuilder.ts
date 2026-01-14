import { BulkCrudOperationKeys, OperationKeys } from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { TransactionOperationKeys } from "@decaf-ts/core";
import { PickType } from "@nestjs/swagger";
import { toPascalCase } from "@decaf-ts/logging";

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
  let exceptions = props.filter((p) => Model.generated(model, p as any));
  if (isUpdate) exceptions = exceptions.filter((p) => p !== Model.pk(model));
  const dto = class DynamicDTO extends PickType(model, exceptions as any[]) {};
  Object.assign(dto, "name", {
    value: `${toPascalCase(model.name)}${toPascalCase(op)}DTO`,
  });
  return dto;
}
