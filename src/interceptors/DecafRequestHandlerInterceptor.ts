import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Scope,
} from "@nestjs/common";
import { DecafHandlerExecutor, DecafRequestContext } from "../request";
import { contextualizeRequestContext } from "../request/contextualize";
import { Logging } from "@decaf-ts/logging";
import "../overrides";

/**
 * @description
 * Interceptor responsible for executing all registered Decaf request handlers
 * before the controller method is invoked.
 *
 * @summary
 * The {@link DecafRequestHandlerInterceptor} integrates the Decaf request-handling pipeline
 * into NestJS' interceptor mechanism. Before passing execution to the next handler in the
 * NestJS chain, it delegates request processing to the {@link DecafHandlerExecutor}, which
 * sequentially runs all registered {@link DecafRequestHandler} instances. This allows
 * behaviors such as authentication, logging, tenant resolution, or metadata enrichment
 * to occur prior to controller execution.
 *
 * @class DecafRequestHandlerInterceptor
 *
 * @example
 * ```ts
 * // Apply globally:
 * app.useGlobalInterceptors(new DecafRequestHandlerInterceptor(executor));
 *
 * // Or in a module:
 * @Module({
 *   providers: [
 *     DecafHandlerExecutor,
 *     {
 *       provide: APP_INTERCEPTOR,
 *       useClass: DecafRequestHandlerInterceptor,
 *     },
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @mermaid
 * sequenceDiagram
 *     participant Client
 *     participant Interceptor
 *     participant Executor
 *     participant Controller
 *
 *     Client->>Interceptor: HTTP Request
 *     Interceptor->>Executor: exec(request)
 *     Executor-->>Interceptor: handlers completed
 *     Interceptor->>Controller: next.handle()
 *     Controller-->>Client: Response
 */
@Injectable({ scope: Scope.REQUEST })
export class DecafRequestHandlerInterceptor implements NestInterceptor {
  constructor(
    protected readonly requestContext: DecafRequestContext,
    protected readonly executor: DecafHandlerExecutor
  ) {}

  protected async contextualize(req: any): Promise<void> {
    contextualizeRequestContext(this.requestContext, req);
  }

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const log = Logging.for(DecafRequestHandlerInterceptor).for(this.intercept);
    log.debug(
      `CONTEXT ${this.requestContext.uuid} - request: ${req.method} ${req.url}`
    );
    await this.contextualize(req);
    log.debug(
      `CONTEXT ${this.requestContext.uuid} contextualized - request: ${req.method} ${req.url}`
    );

    await this.executor.exec(req, res);
    log.debug(
      `CONTEXT ${this.requestContext.uuid} executors finished - request: ${req.method} ${req.url}`
    );
    return next.handle();
  }
}
