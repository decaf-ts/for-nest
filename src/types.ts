import { Adapter, ConfigOf, ContextOf, Context } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { ExecutionContext, Type } from "@nestjs/common";
import { RequestToContextTransformer, type ModelControllerFactoryConfig } from "@decaf-ts/for-http/server";
import { DecafRequestContext } from "./request/index";

export interface DecafRequestHandler<
  C extends DecafRequestContext = DecafRequestContext,
> {
  handle(context: C, req: Request, res: Response): Promise<void>;
}

export interface ObserverEventsOptions {
  /**
   * Enables or disables SSE stream events globally
   */
  enableObserverEvents?: boolean;

  /**
   * List of adapter flavours that will emit stream events
   * If omitted, all registered flavours may be used
   */
  observerFlavours?: any[];

  /**
   * SSE endpoint path
   * @default "/events"
   */
  observerApiPath?: string;
}

/**
 * @publicApi
 */
export type DecafModuleOptions<
  CONF = any,
  A extends Adapter<CONF, any, any, any> = Adapter<CONF, any, any, any>,
> = {
  conf: [
    Constructor<A>,
    ConfigOf<A>,
    ...args:
      | any[]
      | [
          ...any[],
          (
            | RequestToContextTransformer<ContextOf<A>>
            | Constructor<RequestToContextTransformer<ContextOf<A>>>
          ),
        ],
  ][];
  alias?: string;
  autoControllers: boolean;
  autoServices?: boolean;
  controllerExposure?: Record<string, boolean | string[]>;
  controllerConfig?: Record<string, ModelControllerFactoryConfig>;
  observerOptions?: ObserverEventsOptions;
  aggregations?: boolean;
  handlers?: Type<DecafRequestHandler>[];
  initialization?: () => Promise<void>;
};

/**
 * Abstraction used by the {@link AuthInterceptor} to authorize decaf models.
 *
 * // costumauthHandler.ts
 *
 * @example
 * export class CustomAuthHandler implements AuthHandler {
 *   async authorize(ctx: ExecutionContext, resource: string) {
 *     const req = ctx.switchToHttp().getRequest();
 *     const userRole = req.headers.authorization?.split(" ")[1] as string;
 *     if (!userRole) throw new AuthorizationError("Unauthenticated");
 *     const roles = Metadata.get(Model.get(resource)!, AuthRole);
 *     if (!roles.includes(userRole)) {
 *       throw new AuthorizationError("Unauthorized");
 *     }
 *   }
 * }
 *
 * // auth.module.ts
 *
 * @Global()
 * @Module({
 *  providers: [
 *    AuthInterceptor,
 *    CustomAuthHandler,
 *    {
 *      provide: AUTH_HANDLER,
 *      useClass: CustomAuthHandler, //swap this to use another provider
 *    },
 *  ],
 *  exports: [AUTH_HANDLER, AuthInterceptor],
 * })
 * export class AuthModule {}
 */
export interface AuthHandler {
  /**
   * Inspect the request context and ensure the caller can access the model.
   * Implementations should throw an {@link AuthorizationError} on denial.
   *
   * After successful authorization, implementations SHOULD populate the
   * provided DecafRequestContext with auth-derived data (user, organization,
   * roles, etc.) via `context.accumulate({ UUID: user, ... })` so that
   * downstream code (adapters, logging, createdBy/updatedBy) can read it.
   *
   * @param ctx - Nest execution context that exposes the request/response.
   * @param model - Model name or constructor being accessed.
   * @param context - The request-scoped DecafRequestContext to populate with auth data.
   * @param requiredRoles - Optional route-level roles from @RequireRoles() decorator.
   */
  authorize(
    ctx: ExecutionContext,
    model: string | Constructor,
    context?: DecafRequestContext,
    requiredRoles?: string[]
  ): Promise<void> | void;
}
