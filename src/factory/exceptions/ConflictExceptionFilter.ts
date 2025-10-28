import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from "@nestjs/common";
import { HttpResponseError } from "./HttpResponseError";

export class ConflictError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message = "Conflict") {
    super(message);
    this.name = "ConflictError";
    this.status = 409;
    this.code = "CONFLICT";

    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

@Catch(ConflictError)
export class ConflictExceptionFilter implements ExceptionFilter {
  catch(exception: ConflictError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const httpResponseError = new HttpResponseError(request, {
      status: HttpStatus.CONFLICT,
      message: exception.message,
      error: "CONFLICT",
    });

    (response as any).status(httpResponseError.status).json(httpResponseError);
  }
}
