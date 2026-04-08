import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  NotAcceptableException,
  NotFoundException,
} from "@nestjs/common";
import { BaseError, InternalError } from "@decaf-ts/db-decorators";
import { LoggedEnvironment } from "@decaf-ts/logging";
import { UnsupportedError } from "@decaf-ts/core";
import { ToManyRequestsError } from "../errors/throttling";

@Catch()
export class DecafExceptionFilter implements ExceptionFilter {
  catch(exception: Error, host: ArgumentsHost) {
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
      if((exception as BaseError).code === 429){
        exception = new ToManyRequestsError(exception.message);
      }else{
        exception = new InternalError(exception.message);
      }
    }

    response.status((exception as BaseError).code || statusCode).json({
      status: (exception as BaseError).code || statusCode,
      error: isProduction ? exception.name : exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
