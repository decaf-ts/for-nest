import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { BaseError } from "@decaf-ts/db-decorators";
import { LoggedEnvironment } from "@decaf-ts/logging";

@Catch(BaseError)
export class DecafExceptionFilter implements ExceptionFilter {
  catch(exception: BaseError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const isProduction = LoggedEnvironment.env === "production";

    response.status(exception.code).json({
      status: exception.code,
      error: isProduction ? exception.name : exception.message,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
