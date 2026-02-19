import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotAcceptableException,
  NotFoundException,
} from "@nestjs/common";
import { BaseError, InternalError } from "@decaf-ts/db-decorators";
import { LoggedEnvironment } from "@decaf-ts/logging";

@Catch()
export class DecafExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const isProduction = LoggedEnvironment.env === "production";
    let statusCode;
    if (exception instanceof NotFoundException) {
      exception = new NotAcceptableException(exception.message);
      statusCode = (exception as NotAcceptableException).getStatus();
    } else if (!(exception instanceof BaseError))
      exception = new InternalError(exception.message);

    response.status((exception as BaseError).code || statusCode).json({
      status: (exception as BaseError).code || statusCode,
      error: isProduction ? exception.name : exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
