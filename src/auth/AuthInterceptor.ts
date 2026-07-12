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

import {
  AUTH_HANDLER,
  AUTH_META_KEY,
  IS_PUBLIC_KEY,
  REQUIRED_NAMESPACES_KEY,
  REQUIRED_ROLES_KEY,
  SKIP_MODEL_ROLES_KEY,
  SKIP_MODEL_NAMESPACES_KEY,
} from "./constants";
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

    const requiredNamespaces = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_NAMESPACES_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );

    const skipModelRoles = this.reflector.getAllAndOverride<boolean>(
      SKIP_MODEL_ROLES_KEY,
      [ctx.getHandler(), ctx.getClass()]
    );

    const skipModelNamespaces = this.reflector.getAllAndOverride<boolean>(
      SKIP_MODEL_NAMESPACES_KEY,
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
        requiredNamespaces,
        skipModelNamespaces,
        this.requestContext
      );
    } else {
      log.debug(`No auth handler registered`);
    }

    await this.applyTransformers();

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
      const instance = (transformer as any).from
        ? transformer
        : new (transformer as any)();
      const from = await instance.from(this.requestContext);
      if (from) this.requestContext.accumulate(from);
    }
  }
}
