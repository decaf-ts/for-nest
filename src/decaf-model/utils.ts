import { Get } from "@nestjs/common";
import { Logger } from "@decaf-ts/logging";
import { Controller, type DecoratorBundle } from "./types";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from "@nestjs/swagger";
import {
  DecafApiProperty,
  type DecafParamProps,
  DecafParams,
} from "./decorators";

export function createRouteHandler<T>(methodName: string) {
  return async function (
    this: Controller,
    pathParams: DecafParamProps
  ): Promise<T> {
    const log: Logger = this.log.for(methodName);

    try {
      log.debug(
        `Invoking persistence method "${methodName}" given parameters: ${JSON.stringify(pathParams.valuesInOrder)}`
      );
      return (await (this.persistence as Record<string, any>)[methodName](
        ...pathParams.valuesInOrder
      )) as T;
    } catch (e: any) {
      log.error(`Custom query "${methodName}" failed`, e);
      throw e;
    }
  };
}

export function defineRouteMethod(
  ControllerClass: new (...args: any[]) => any,
  methodName: string,
  handler: (...args: any[]) => any
): PropertyDescriptor | undefined {
  Object.defineProperty(
    ControllerClass.prototype || ControllerClass,
    methodName,
    {
      value: handler,
      writable: false,
    }
  );

  return Object.getOwnPropertyDescriptor(
    ControllerClass.prototype || ControllerClass,
    methodName
  );
}

const extractPathParams = (routePath: string): string[] => {
  return routePath
    .split("/")
    .filter((p) => p.startsWith(":"))
    .map((p) => p.slice(1));
};

const apiParamSpec = (name: string): DecafApiProperty => ({
  name,
  description: `${name} parameter for the query`,
  required: true,
  type: String,
});

export function getApiDecorators(
  methodName: string,
  routePath: string
): DecoratorBundle {
  const apiPathParams = extractPathParams(routePath).map(apiParamSpec);
  return {
    method: [
      Get(routePath),
      ...apiPathParams.map(ApiParam),
      ApiOperation({
        summary: `Retrieve records using custom query "${methodName}".`,
      }),
      ApiOkResponse({
        description: `Results successfully retrieved.`,
      }),
      ApiNoContentResponse({
        description: `No content returned by the query.`,
      }),
    ],
    params: [DecafParams(apiPathParams)],
  };
}

export function applyApiDecorators(
  target: any,
  methodName: string,
  descriptor: PropertyDescriptor,
  decorators: DecoratorBundle
) {
  const proto = target?.prototype ?? target;
  decorators.method.forEach((d) => d(proto, methodName, descriptor));
  decorators.params?.forEach((d, index) => d(proto, methodName, index));
}
