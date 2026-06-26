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
import { Adapter } from "@decaf-ts/core";
import { RequestToContextTransformer } from "@decaf-ts/for-http/server";

import { AUTH_HANDLER, AUTH_META_KEY, IS_PUBLIC_KEY, REQUIRED_ROLES_KEY, SKIP_MODEL_ROLES_KEY } from "./constants";
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

    const skipModelRoles = this.reflector.getAllAndOverride<boolean>(
      SKIP_MODEL_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );

    const effectiveModel = skipModelRoles ? undefined : modelName;

    log.verbose(`Intercepted request${modelName ? ` for ${modelName}` : ""}`);

    if (isPublic) {
      log.debug(`Public route — skipping auth`);
    } else if (this.authHandler) {
      await this.authHandler.authorize(
        ctx,
        effectiveModel as string | Constructor,
        requiredRoles,
        this.requestContext
      );
    } else {
      log.debug(`No auth handler registered`);
    }

    // Transformers run AFTER auth so they can read auth-populated fields
    // (e.g. `user`) from the context and map them to adapter-specific keys
    // (e.g. `UUID` for RamAdapter's @createdBy/@updatedBy handlers).
    await this.applyTransformers();

    const user = this.requestContext.getOrUndefined("user" as any);
    const organization = this.requestContext.getOrUndefined("organization" as any);
    if (user || organization) {
      const currentLog = this.requestContext.get("logger" as any);
      const childLog = currentLog.for({ user, organization });
      this.requestContext.accumulate({ logger: childLog } as any);
    }

    return next.handle();
  }

  protected async applyTransformers(): Promise<void> {
    const flavours = Adapter.flavoursToTransform();
    if (!flavours) return;

    for (const flavour of flavours) {
      const transformer = Adapter.transformerFor(
        flavour
      ) as RequestToContextTransformer<any>;
      if (!transformer) continue;
      const from = await transformer.from(this.requestContext);
      if (from) this.requestContext.accumulate(from);
    }
  }
}
