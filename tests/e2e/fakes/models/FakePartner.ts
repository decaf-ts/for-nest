import { uses } from "@decaf-ts/decoration";
import { BaseModel, column, pk, table } from "@decaf-ts/core";
// @ts-expect-error ram
import { RamFlavour } from "@decaf-ts/core/ram";
import { model, ModelArg, required } from "@decaf-ts/decorator-validation";
import { Roles } from "../../../../src/index";

@uses(RamFlavour)
@table("fake")
@Roles(["partner"])
@model()
export class FakePartner extends BaseModel {
  @pk({ type: String, generated: false })
  id!: string;

  @column()
  @required()
  name!: string;

  constructor(args?: ModelArg<FakePartner>) {
    super(args);
  }
}
