import { uses } from "@decaf-ts/decoration";
import {
  Cascade,
  column,
  defaultQueryAttr,
  oneToMany,
  pk,
  table,
} from "@decaf-ts/core";
// @ts-expect-error ram
import { RamFlavour } from "@decaf-ts/core/ram";
import {
  maxlength,
  minlength,
  Model,
  model,
  ModelArg,
  pattern,
} from "@decaf-ts/decorator-validation";
import { composed, readonly } from "@decaf-ts/db-decorators";
import { Fake } from "./Fake";

@uses(RamFlavour)
@table("product")
@model()
export class Product extends Model {
  @pk({ type: String, generated: false })
  @composed(["productCode", "batchNumber"], ":")
  id!: string;

  @defaultQueryAttr()
  @column()
  @minlength(14)
  @maxlength(14)
  @readonly()
  productCode!: string;

  @defaultQueryAttr()
  @column()
  @readonly()
  @pattern(/^[a-zA-Z0-9/-]{1,20}$/)
  batchNumber!: string;

  @defaultQueryAttr()
  @column()
  name!: string;

  @column()
  country!: string;

  @column()
  expiryDate!: number;
  //
  // @oneToOne(
  //   () => Fake,
  //   {
  //     update: Cascade.CASCADE,
  //     delete: Cascade.CASCADE,
  //   },
  //   true
  // )
  // partner!: Fake;

  @oneToMany(
    () => Fake,
    {
      update: Cascade.CASCADE,
      delete: Cascade.CASCADE,
    },
    true
  )
  partners!: Fake;

  constructor(model?: ModelArg<Product>) {
    super(model);
  }
}
