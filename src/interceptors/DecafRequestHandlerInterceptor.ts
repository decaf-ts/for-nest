import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Scope,
} from "@nestjs/common";
import { DecafHandlerExecutor } from "../services";

@Injectable({ scope: Scope.REQUEST })
export class DecafRequestHandlerInterceptor implements NestInterceptor {
  constructor(private readonly executor: DecafHandlerExecutor) {}

  async intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    await this.executor.exec(req);
    return next.handle();
  }
}
