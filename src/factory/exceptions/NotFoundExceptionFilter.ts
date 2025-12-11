import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { HttpResponseError } from "./HttpResponseError";
import { NotFoundError } from "@decaf-ts/db-decorators";

@Catch(NotFoundError)
export class NotFoundExceptionFilter implements ExceptionFilter {
  catch(exception: NotFoundError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const httpResponseError = new HttpResponseError(request, {
      status: HttpStatus.NOT_FOUND,
      message: exception.message,
      error: "NOT_FOUND",
    });

    (response as any).status(httpResponseError.status).json(httpResponseError);
  }
}
