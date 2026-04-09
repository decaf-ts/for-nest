import { uses } from "@decaf-ts/decoration";
import { column, pk, table } from "@decaf-ts/core";
// @ts-expect-error ram
import { RamFlavour } from "@decaf-ts/core/ram";
import {
  Model,
  model,
  ModelArg,
  required,
} from "@decaf-ts/decorator-validation";

@uses(RamFlavour)
@table("fake")
@model()
export class Fake extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @column()
  @required()
  name!: string;

  constructor(args?: ModelArg<Fake>) {
    super(args);
  }
}
