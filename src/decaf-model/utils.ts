import { Get } from "@nestjs/common";
import { Controller, type DecoratorBundle } from "./types";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from "@nestjs/swagger";
import {
  DecafApiProperties,
  type DecafParamProps,
  DecafParams,
} from "./decorators/index";

export function createRouteHandler<T>(methodName: string) {
  return async function (
    this: Controller,
    params: DecafParamProps
  ): Promise<T> {
    const log = this.log.for(methodName);

    try {
      log.debug(`Executing custom query "${methodName}" with args: ${params}`);
      return (await (this.persistence as Record<string, any>)[methodName](
        ...params
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

const apiParamSpec = (name: string): DecafApiProperties => ({
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
