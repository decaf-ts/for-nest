import { uses } from "@decaf-ts/decoration";
import { column, pk, table } from "@decaf-ts/core";
import { RamFlavour } from "@decaf-ts/core/ram";
import { Model, model, ModelArg } from "@decaf-ts/decorator-validation";

@uses(RamFlavour)
@table("process_step")
@model()
export class ProcessStep extends Model {
  @pk({ type: "String", generated: false })
  id!: string;

  @column()
  currentStep!: number;

  @column()
  totalSteps!: number;

  @column()
  label!: string;

  constructor(model?: ModelArg<ProcessStep>) {
    super(model);
  }
}
