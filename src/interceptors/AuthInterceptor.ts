import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";

import { Constructor } from "@decaf-ts/decoration";
import { AUTH_HANDLER, AUTH_META_KEY } from "../constants";
import type { AuthHandler } from "../types";

@Injectable()
export class AuthInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(AUTH_HANDLER) private readonly authHandler?: AuthHandler
  ) {}

  async intercept(
    ctx: ExecutionContext,
    next: CallHandler
  ): Promise<Observable<any>> {
    const modelName =
      this.reflector.get<string | Constructor>(
        AUTH_META_KEY,
        ctx.getHandler()
      ) ??
      this.reflector.get<string | Constructor>(AUTH_META_KEY, ctx.getClass());

    if (modelName && this.authHandler) {
      await this.authHandler.authorize(ctx, modelName);
    }

    return next.handle();
  }
}
