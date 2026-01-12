import { Adapter, ConfigOf } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { ExecutionContext, Type } from "@nestjs/common";
import { DecafServerContext } from "./constants";

export interface RequestContextAccessor {
  set(key: string | symbol, value: any): void;
  get<T = any>(key: string | symbol): T | undefined;
}

export interface DecafRequestHandler<
  C extends DecafServerContext = DecafServerContext,
> {
  handle(context: C, req: Request, res: Response): Promise<void>;
}

/**
 * @publicApi
 */
export type DecafModuleOptions<
  CONF = any,
  A extends Adapter<CONF, any, any, any> = Adapter<CONF, any, any, any>,
> = {
  conf: [Constructor<A>, ConfigOf<A>, ...args: any[]][];
  alias?: string;
  autoControllers: boolean;
  autoServices?: boolean;
  handlers?: Type<DecafRequestHandler>[];
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
   * @param ctx - Nest execution context that exposes the request/response.
   * @param model - Model name or constructor being accessed.
   */
  authorize(
    ctx: ExecutionContext,
    model: string | Constructor
  ): Promise<void> | void;
}
