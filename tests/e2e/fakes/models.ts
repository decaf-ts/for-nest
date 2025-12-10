import { uses } from "@decaf-ts/decoration";
import { BaseModel, column, pk, RamFlavour, table } from "@decaf-ts/core";
import {
  maxlength,
  minlength,
  model,
  type ModelArg,
  pattern,
  required,
} from "@decaf-ts/decorator-validation";
import { composed, readonly } from "@decaf-ts/db-decorators";
import { FabricFlavour } from "@decaf-ts/for-fabric/shared";
import { Roles } from "../../../src/decaf-model/decorators/decorators";

@uses(RamFlavour)
@table("fake")
@model()
@Roles(["partner"])
export class Fake extends BaseModel {
  @pk({ type: "String", generated: false })
  id!: string;

  @column()
  @required()
  name!: string;

  constructor(args?: ModelArg<Fake>) {
    super(args);
  }
}

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

  constructor(model?: ModelArg<Product>) {
    super(model);
  }
}
