import { uses } from "@decaf-ts/decoration";
import {
  BaseModel,
  column,
  createdBy,
  pk,
  table,
  updatedBy,
} from "@decaf-ts/core";
// @ts-expect-error ram
import { RamFlavour } from "@decaf-ts/core/ram";
import {
  maxlength,
  minlength,
  model,
  ModelArg,
  pattern,
} from "@decaf-ts/decorator-validation";
import { Roles } from "../../../../src";
import { composed, readonly } from "@decaf-ts/db-decorators";

@uses(RamFlavour)
@table("product")
@model()
@Roles(["admin"])
export class Product extends BaseModel {
  @pk({ type: "String", generated: false })
  @composed(["productCode", "batchNumber"], ":", true)
  id!: string;

  @column()
  @minlength(14)
  @maxlength(14)
  @readonly()
  productCode!: string;

  @column()
  @readonly()
  @pattern(/^[a-zA-Z0-9/-]{1,20}$/)
  batchNumber!: string;

  @column()
  name!: string;

  @createdBy()
  createdBy!: string;

  @updatedBy()
  updatedBy!: string;

  constructor(args?: ModelArg<Product>) {
    super(args);
  }
}
