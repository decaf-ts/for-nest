import { Query } from "@nestjs/common";
import { Logger } from "@decaf-ts/logging";
import { type DecoratorBundle } from "./types";
import {
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from "@nestjs/swagger";
import {
  DecafApiProperty,
  type DecafParamProps,
  DecafParams,
  HttpVerbs,
} from "./decorators";
import {
  DirectionLimitOffset,
  ModelService,
  OrderDirection,
  Repo,
} from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { HttpVerbToDecorator } from "./decorators/utils";
import { DecafModelController } from "../controllers";

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
  routePath: string,
  httpVerb: HttpVerbs,
  includeQueryParams: boolean = false
): DecoratorBundle {
  const NestHttpRouteDec = HttpVerbToDecorator(httpVerb);
  const apiPathParams = extractPathParams(routePath).map(apiParamSpec);

  const swaggerQueryParams = [];
  if (httpVerb === "GET" && includeQueryParams) {
    swaggerQueryParams.push(
      ApiQuery({
        name: "direction",
        required: false,
        enum: OrderDirection,
        description: "the sort order when applicable",
      }),
      ApiQuery({
        name: "limit",
        required: false,
        description: "limit or page size when applicable",
      }),
      ApiQuery({
        name: "offset",
        required: false,
        description: "offset or bookmark when applicable",
      })
    );
  }

  return {
    method: [
      NestHttpRouteDec(routePath),
      ...apiPathParams.map(ApiParam),
      ...swaggerQueryParams,
      ApiOperation({
        summary: `Retrieve records using according to "${methodName}".`,
      }),
      ApiOkResponse({
        description: `Result successfully retrieved.`,
      }),
      ApiNoContentResponse({
        description: `No content returned by the method.`,
      }),
    ],
    params: [DecafParams(apiPathParams), Query()], // , DecafBody()],
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

export function resolvePersistenceMethod<T extends Model<boolean>>(
  persistence: Repo<T> | ModelService<T>,
  methodName: string,
  ...args: any[]
): any {
  if (persistence instanceof ModelService) {
    return typeof (persistence as any)[methodName] === "function"
      ? (persistence as any)[methodName](...args)
      : persistence.statement(methodName, ...args);
  }

  if (typeof (persistence as any)[methodName] === "function")
    return (persistence as any)[methodName](...args);

  throw new Error(
    `Persistence method "${methodName}" not found on ${persistence?.constructor?.name}`
  );
}

export function createRouteHandler<T>(methodName: string) {
  return async function (
    this: DecafModelController<any>,
    pathParams: DecafParamProps,
    queryParams: DirectionLimitOffset
  ): Promise<T> {
    const log: Logger = this.log.for(methodName);

    try {
      log.debug(
        `Invoking persistence method "${methodName}" given parameters: ${JSON.stringify(pathParams.valuesInOrder)}`
      );
      const { direction, limit, offset } = queryParams;
      return await resolvePersistenceMethod(
        this.persistence(),
        methodName,
        ...pathParams.valuesInOrder,
        direction,
        limit,
        offset
      );
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
