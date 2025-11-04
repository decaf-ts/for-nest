import { Metadata } from "@decaf-ts/decoration";
import { Delete, Get, Patch, Post, Put } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { apply } from "@decaf-ts/reflection";
import { CrudOperations, OperationKeys } from "@decaf-ts/db-decorators";
import { ModelConstructor } from "@decaf-ts/decorator-validation";
import { HttpVerbs } from "./types";

/**
 * @description Determines if a given CRUD operation is blocked for a specific model constructor.
 * @summary Retrieves the operation-blocking handler metadata stored on the provided model constructor (under `OperationKeys.REFLECT + OperationKeys.BLOCK`), executes it (if present) with its persisted arguments plus the requested operation, and returns whether the operation is blocked. If no handler exists, the operation is considered allowed (returns `false`).
 * @param {ModelConstructor<any>} ModelConstructor - The target model constructor whose metadata may include a blocking handler.
 * @param {CrudOperations} op - The CRUD operation to evaluate (e.g., `OperationKeys.CREATE`, `OperationKeys.READ`, `OperationKeys.UPDATE`, `OperationKeys.DELETE`).
 * @return {boolean} `true` when the operation is explicitly blocked by the model's handler; otherwise `false`.
 * @function isOperationBlocked
 */
export function isOperationBlocked(
  ModelConstructor: ModelConstructor<any>,
  op: CrudOperations
): boolean {
  const { handler, args } = (Metadata.get(
    ModelConstructor as any,
    OperationKeys.REFLECT + OperationKeys.BLOCK
  ) || {}) as {
    handler: (
      operations: CrudOperations[],
      operation: CrudOperations
    ) => boolean;
    args: any[];
  };

  // @ts-ignore
  return !handler ? false : (handler(...args, op) ?? false);
}

/**
 * @description Conditionally applies an HTTP method decorator for a given model and verb, hiding the endpoint in Swagger (and not registering the route) when the model blocks that CRUD operation.
 * @summary Maps an HTTP verb to its corresponding `CrudOperations` key and Nest HTTP decorator (`@Get`, `@Post`, etc.). It checks `isOperationBlocked(ModelConstructor, crudOp)` and, if blocked, applies only `@ApiExcludeEndpoint()` (Swagger-hidden, no Nest route). If permitted, it applies the appropriate HTTP decorator with the optional `path`.
 * @param {ModelConstructor<any>} ModelConstructor - The model constructor used to resolve operation-blocking rules.
 * @param {HttpVerbs} verb - The HTTP verb to map (e.g., `"GET" | "POST" | "PUT" | "PATCH" | "DELETE"`).
 * @param {string} [path] - Optional route path passed through to the corresponding Nest HTTP method decorator.
 * @return {MethodDecorator} A method decorator that either excludes the endpoint from Swagger (and route registration) or applies the correct HTTP decorator.
 */
export function ApiOperationFromModel(
  ModelConstructor: ModelConstructor<any>,
  verb: HttpVerbs,
  path?: string
): MethodDecorator {
  const httpToCrud: Record<
    HttpVerbs,
    [CrudOperations, (path?: string) => MethodDecorator]
  > = {
    GET: [OperationKeys.READ, Get],
    POST: [OperationKeys.CREATE, Post],
    PUT: [OperationKeys.UPDATE, Put],
    PATCH: [OperationKeys.UPDATE, Patch],
    DELETE: [OperationKeys.DELETE, Delete],
  };

  const [crudOp, HttpMethodDecorator] = httpToCrud[verb];
  return isOperationBlocked(ModelConstructor, crudOp)
    ? apply(ApiExcludeEndpoint())
    : apply(HttpMethodDecorator(path));
}
