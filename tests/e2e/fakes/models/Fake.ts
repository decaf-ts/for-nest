import { uses } from "@decaf-ts/decoration";
import { column, pk, RamFlavour, table } from "@decaf-ts/core";
import { model, ModelArg, required } from "@decaf-ts/decorator-validation";

@uses(RamFlavour)
@table("fake")
@model()
export class Fake {
  @pk({ type: "String", generated: false })
  id!: string;

  @column()
  @required()
  name!: string;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(args?: ModelArg<Fake>) {}
}
