import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ConflictException,
  ExceptionFilter,
  ForbiddenException,
  HttpException,
  Injectable,
  NotAcceptableException,
  NotFoundException,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ContextIdFactory, ModuleRef } from "@nestjs/core";
import {
  BadRequestError,
  BaseError,
  ConflictError,
  InternalError,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { LoggedEnvironment, Logging } from "@decaf-ts/logging";
import { AuthorizationError, ForbiddenError, UnsupportedError } from "@decaf-ts/core";
import { ToManyRequestsError } from "../errors/throttling";
import { DecafRequestContext } from "../../request/DecafRequestContext";
import type { RequestLogger } from "@decaf-ts/for-http/server";

/**
 * @description Maps well-known NestJS `HttpException` subclasses (as guards, pipes, or
 * other framework-level code would throw them) onto the equivalent decaf-ts `BaseError`.
 * @summary Only `BaseError` instances carry the `.code` the response body relies on, so
 * without this map every non-decaf exception — including perfectly legitimate ones like a
 * guard's `ForbiddenException` — would be flattened into a generic 500 `InternalError`.
 */
const HTTP_EXCEPTION_TO_DECAF_ERROR = new Map<
  new (...args: any[]) => HttpException,
  (msg: string) => BaseError
>([
  [UnauthorizedException, (msg) => new AuthorizationError(msg)],
  [ForbiddenException, (msg) => new ForbiddenError(msg)],
  [BadRequestException, (msg) => new BadRequestError(msg)],
  [ConflictException, (msg) => new ConflictError(msg)],
  [UnprocessableEntityException, (msg) => new ValidationError(msg)],
]);

@Catch()
@Injectable()
export class DecafExceptionFilter implements ExceptionFilter {
  constructor(@Optional() protected readonly moduleRef?: ModuleRef) {}

  async catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const isProduction = LoggedEnvironment.env === "production";
    let statusCode;

    if (
      exception instanceof NotFoundException ||
      exception instanceof UnsupportedError
    ) {
      exception = new NotAcceptableException(exception.message);
      statusCode = (exception as NotAcceptableException).getStatus();
    } else if (!(exception instanceof BaseError)) {
      const toDecafError = this.decafErrorFor(exception);
      if (toDecafError) {
        exception = toDecafError(exception.message);
      } else if ((exception as any).status === 429) {
        exception = new ToManyRequestsError(exception.message);
      } else if (exception instanceof HttpException) {
        // A recognized but unmapped HttpException (e.g. thrown by a guard or
        // pipe) — preserve its real status instead of flattening it to 500.
        statusCode = exception.getStatus();
      } else {
        exception = new InternalError(exception.message);
      }
    }

    await this.logError(request, exception);

    response.status((exception as BaseError).code || statusCode).json({
      status: (exception as BaseError).code || statusCode,
      error: isProduction ? exception.name : exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }

  /**
   * @description Finds the decaf-ts `BaseError` constructor mapped to this exception's type, if any.
   * @summary Walks `HTTP_EXCEPTION_TO_DECAF_ERROR` with `instanceof` (rather than a straight
   * `Map.get`) so subclasses of a mapped exception are matched too.
   */
  protected decafErrorFor(
    exception: Error
  ): ((msg: string) => BaseError) | undefined {
    for (const [type, factory] of HTTP_EXCEPTION_TO_DECAF_ERROR) {
      if (exception instanceof type) return factory;
    }
    return undefined;
  }

  /**
   * @description Logs the exception without ever letting logging failures block the response.
   * @summary A guard (or middleware/CORS check) can throw before any decaf-aware provider ran,
   * so the request-bound Context may not exist yet — or the resolved logger's `.error()` itself
   * could throw (broken transport, formatter bug, etc.). Either way the client-facing error
   * response below must still go out, so every failure mode here is swallowed, falling back to
   * the plain `Logging.get()` logger and, as a last resort, doing nothing at all.
   */
  protected async logError(
    request: Record<string, any>,
    exception: Error
  ): Promise<void> {
    const message = `Unhandled error on ${request?.method} ${request?.url}`;
    try {
      const log = await this.resolveLogger(request);
      log.error(message, exception);
    } catch {
      try {
        Logging.get().error(message, exception);
      } catch {
        // logging is unavailable — the response is still sent below
      }
    }
  }

  /**
   * @description Resolves the logger bound to the originating request's decaf-ts Context.
   * @summary Global filters are singletons, so the request-scoped {@link DecafRequestContext}
   * (and the client/user-bound logger it carries) can't be constructor-injected. Instead, this
   * looks up the same request's context id and re-resolves the already-accumulated instance
   * through `ModuleRef`. Falls back to the generic `Logging.get()` logger when the filter wasn't
   * constructed with a `ModuleRef` (e.g. manually `new`'d) or no request-scoped context exists
   * for this request (e.g. the error happened before any decaf-aware provider ran, as is the
   * case when a guard rejects the request before interceptors get to bind the client-scoped
   * logger onto the Context).
   */
  protected async resolveLogger(
    request: Record<string, any>
  ): Promise<RequestLogger> {
    if (this.moduleRef) {
      try {
        const contextId = ContextIdFactory.getByRequest(request);
        const requestContext = await this.moduleRef.resolve(
          DecafRequestContext,
          contextId,
          { strict: false }
        );
        if (requestContext?.logger) return requestContext.logger;
      } catch {
        // no request-scoped context bound for this request — fall back below
      }
    }
    return Logging.get() as unknown as RequestLogger;
  }
}
