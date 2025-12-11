import { Get } from "@nestjs/common";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
} from "@nestjs/swagger";

export function createRouteHandler(methodName: string) {
  return async function (...params: string[]) {
    const log = this.log.for(methodName);

    try {
      log.debug(`Executing custom query "${methodName}" with args:`, params);
      return await (this.persistence as any)[methodName](...params);
    } catch (error) {
      log.error(`Custom query "${methodName}" failed`, error);
      throw error;
    }
  };
}

export function defineMethod(
  ControllerClass: any,
  methodName: string,
  handler: (...args) => any
): PropertyDescriptor | undefined {
  Object.defineProperty(
    ControllerClass?.prototype || ControllerClass,
    methodName,
    {
      value: handler,
      writable: false,
    }
  );

  return Object.getOwnPropertyDescriptor(
    ControllerClass?.prototype || ControllerClass,
    methodName
  );
}

export function buildCustomQueryDecorators(
  methodName: string,
  routePath: string,
  fields: string[]
): MethodDecorator[] {
  return [
    Get(routePath),

    ...fields.map((field) =>
      ApiParam({
        name: field,
        description: `${field} parameter for the query`,
        required: true,
        type: String,
      })
    ),

    ApiOperation({
      summary: `Retrieve records using custom query "${methodName}".`,
    }),

    ApiOkResponse({
      description: `Results successfully retrieved.`,
    }),

    ApiNoContentResponse({
      description: `No content returned by the query.`,
    }),
  ];
}

export function applyMethodDecorators(
  target: any,
  methodName: string,
  descriptor: PropertyDescriptor,
  decorators: MethodDecorator[]
) {
  decorators.forEach((d) =>
    d(target?.prototype || target, methodName, descriptor)
  );
}
