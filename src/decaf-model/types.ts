import { ModelService, Repo } from "@decaf-ts/core";
import { LoggedClass, Logger } from "@decaf-ts/logging";
import { DecafRequestContext } from "../request/index";

export interface Controller {
  log: Logger;
  persistence: Repo<any> | ModelService<any>;
}

export abstract class AbstractQueryController extends LoggedClass {
  protected readonly clientContext: DecafRequestContext;
  protected _persistence!: Repo<any> | ModelService<any>;

  protected constructor(clientContext: DecafRequestContext) {
    super();
    this.clientContext = clientContext;
  }

  get persistence(): Repo<any> | ModelService<any> {
    throw new Error("Not implemented");
  }
}

export type ControllerConstructor<T> = new (...args: any[]) => T;

export type DecoratorBundle = {
  method: MethodDecorator[];
  params?: ParameterDecorator[];
};
