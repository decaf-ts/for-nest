import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
  Scope,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";

import { Constructor } from "@decaf-ts/decoration";
import { Logging } from "@decaf-ts/logging";

import { AUTH_HANDLER, AUTH_META_KEY, IS_PUBLIC_KEY, REQUIRED_ROLES_KEY } from "./constants";
import type { AuthHandler } from "../types";
import { DecafRequestContext } from "../request/DecafRequestContext";

@Injectable({ scope: Scope.REQUEST })
export class AuthInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    protected readonly requestContext: DecafRequestContext,
    @Optional() @Inject(AUTH_HANDLER) private readonly authHandler?: AuthHandler
  ) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler
  ): Promise<Observable<any>> {
    const log = Logging.for(this as any).for(this.intercept);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      log.debug(`Public route — skipping auth`);
      return next.handle();
    }

    const modelName =
      this.reflector.get<string | Constructor>(
        AUTH_META_KEY,
        ctx.getHandler()
      ) ??
      this.reflector.get<string | Constructor>(AUTH_META_KEY, ctx.getClass());

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );

    log.verbose(`Intercepted request${modelName ? ` for ${modelName}` : ""}`);
    if (this.authHandler) {
      await this.authHandler.authorize(
        ctx,
        modelName as string | Constructor,
        requiredRoles,
        this.requestContext
      );

      const user = this.requestContext.getOrUndefined("UUID" as any);
      const organization = this.requestContext.getOrUndefined("organization" as any);
      if (user || organization) {
        const currentLog = this.requestContext.get("logger" as any);
        const childLog = currentLog.for({ user, organization });
        this.requestContext.accumulate({ logger: childLog } as any);
      }
    } else {
      log.debug(`No auth handler registered`);
    }

    return next.handle();
  }
}
