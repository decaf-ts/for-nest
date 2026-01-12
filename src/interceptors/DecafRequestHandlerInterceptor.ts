import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Scope,
} from "@nestjs/common";
import { DecafHandlerExecutor, DecafRequestContext } from "../request";
import { Adapter, Context } from "@decaf-ts/core";
import { DecafServerContext, DecafServerFlags } from "../constants";
import "../overrides";
import { Logging } from "@decaf-ts/logging";
import { InternalError } from "@decaf-ts/db-decorators";

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

  protected async contextualize(req: any): Promise<DecafServerContext> {
    const headers = req.headers;
    const flags: DecafServerFlags = {
      headers: headers,
    } as any;

    const flavours = Adapter.flavoursToTransform();
    if (flavours)
      for (const flavour of flavours) {
        try {
          const transformer = Adapter.transformerFor(flavour);
          if (transformer)
            Object.assign(flags, await new transformer().from(req));
        } catch (e: unknown) {
          throw new InternalError(`Failed to contextualize request: ${e}`);
        }
      }
    const ctx = new Context().accumulate(
      Object.assign(
        {
          logger: Logging.get(),
          timestamp: new Date(),
        },
        flags
      )
    );
    return ctx;
  }

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const ctx = await this.contextualize(req);
    this.requestContext.applyCtx(ctx);
    await this.executor.exec(req, res);
    return next.handle();
  }
}
