import {
  Inject,
  Injectable,
  NestMiddleware,
  Optional,
  Scope,
} from "@nestjs/common";
import { AUTH_HANDLER } from "./constants";
import type { AuthHandler } from "../types";
import { DecafRequestContext } from "../request/DecafRequestContext";
import { contextualizeRequestContext } from "../request/contextualize";

@Injectable({ scope: Scope.REQUEST })
export class AuthMiddleware implements NestMiddleware {
  constructor(
    @Optional()
    @Inject(AUTH_HANDLER)
    private readonly authHandler: AuthHandler | undefined,
    private readonly requestContext: DecafRequestContext
  ) {}

  async use(req: any, _res: any, next: () => void | Promise<void>): Promise<void> {
    contextualizeRequestContext(this.requestContext, req);
    if (this.authHandler) {
      try {
        await this.authHandler.prime(req, this.requestContext as any);
      } catch {
        // Priming is best-effort. The interceptor will still perform validation.
      }
    }
    await next();
  }
}
