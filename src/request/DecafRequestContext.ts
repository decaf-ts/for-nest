import { Injectable, Scope } from "@nestjs/common";
import { DecafServerContext } from "../constants";
import { InternalError } from "@decaf-ts/db-decorators";

/**
 * @description
 * Request-scoped context used to store arbitrary values for the duration of a single request.
 *
 * @summary
 * The {@link DecafRequestContext} class provides an isolated per-request key-value cache,
 * enabling services and controllers to share state or metadata without relying on global
 * or static variables. Keys may be strings or symbols, and cached values may hold any
 * serializable or non-serializable object.
 *
 * @class DecafRequestContext
 *
 * @example
 * ```ts
 * // Saving a value in the request context:
 * context.set("tenantId", "abc123");
 *
 * // Retrieving it later in the request lifecycle:
 * const tenantId = context.get<string>("tenantId");
 * ```
 */
@Injectable({ scope: Scope.REQUEST })
export class DecafRequestContext<
  C extends DecafServerContext = DecafServerContext,
> {
  private _ctx?: C;

  applyCtx(ctx: C) {
    this._ctx = ctx;
  }

  get ctx(): C {
    if (!this._ctx)
      throw new InternalError(`Context not initialized for request`);
    return this._ctx;
  }
}
