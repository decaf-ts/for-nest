import { DecafModelController } from "../controllers";
import { Model } from "@decaf-ts/decorator-validation";

export type ControllerConstructor<T extends Model<boolean>> = new (
  ...args: any[]
) => DecafModelController<T>;

export type DecoratorBundle = {
  method: MethodDecorator[];
  params?: ParameterDecorator[];
};
