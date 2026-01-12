import { uses } from "@decaf-ts/decoration";
import { BaseModel, column, pk, table } from "@decaf-ts/core";
import { RamFlavour } from "@decaf-ts/core/ram";
import { model, ModelArg, required } from "@decaf-ts/decorator-validation";
import { Roles } from "../../../../src/index";

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
