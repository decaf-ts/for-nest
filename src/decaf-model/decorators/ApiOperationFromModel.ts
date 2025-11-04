import { Metadata } from "@decaf-ts/decoration";
import { Delete, Get, Patch, Post, Put } from "@nestjs/common";
import { ApiExcludeEndpoint } from "@nestjs/swagger";
import { apply } from "@decaf-ts/reflection";
import { CrudOperations, OperationKeys } from "@decaf-ts/db-decorators";
import { ModelConstructor } from "@decaf-ts/decorator-validation";
import { HttpVerbs } from "./types";

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
 * Decorador de rota condicional:
 * - Se bloqueado: aplica somente `@ApiExcludeEndpoint()` → Swagger oculta; e como NÃO aplica @Get/@Post/etc, Nest NÃO registra rota.
 * - Se permitido: aplica o decorador HTTP correspondente.
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
