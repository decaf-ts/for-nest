import { uses } from "@decaf-ts/decoration";
import { column, pk, RamFlavour, table } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  model,
  ModelArg,
  pattern,
} from "@decaf-ts/decorator-validation";
import { composed, readonly } from "@decaf-ts/db-decorators";

@uses(RamFlavour)
@table("product")
@model()
export class Product {
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

  constructor(model?: ModelArg<Product>) {}
}
