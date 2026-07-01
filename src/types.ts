import { Adapter, ConfigOf, ContextOf } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { ExecutionContext, Type } from "@nestjs/common";
import {
  RequestToContextTransformer,
  type ModelControllerFactoryConfig,
  type AuthHandler as AuthHandlerBase,
} from "@decaf-ts/for-http/server";
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
 * NestJS-narrowed alias for the base {@link AuthHandlerBase} class from
 * `@decaf-ts/for-http/server`, specializing the execution context to
 * `ExecutionContext` and the request context to {@link DecafRequestContext}.
 *
 * Concrete handlers extend this class and override `extractFromAuth`.
 *
 * @example
 * export class CustomAuthHandler extends AuthHandler {
 *   protected extractFromAuth(ctx: ExecutionContext) {
 *     const req = ctx.switchToHttp().getRequest();
 *     const userRole = req.headers.authorization?.split(" ")[1] as string;
 *     if (!userRole) throw new AuthorizationError("Unauthenticated");
 *     return { user: userRole, roles: [userRole] };
 *   }
 * }
 *
 * // auth.module.ts
 * @Global()
 * @Module({
 *  providers: [
 *    AuthInterceptor,
 *    CustomAuthHandler,
 *    { provide: AUTH_HANDLER, useClass: CustomAuthHandler },
 *  ],
 *  exports: [AUTH_HANDLER, AuthInterceptor],
 * })
 * export class AuthModule {}
 */
export type AuthHandler<
  EC = ExecutionContext,
  C extends DecafRequestContext = DecafRequestContext,
> = AuthHandlerBase<EC, C>;
