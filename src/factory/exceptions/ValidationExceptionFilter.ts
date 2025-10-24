import {ArgumentsHost, Catch, ExceptionFilter, HttpStatus} from "@nestjs/common";
import {Request, Response} from "express";
import {HttpResponseError} from "./HttpResponseError";

export class ValidationError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(message = "Validation failed") {
        super(message);
        this.name = "ValidationError";
        this.status = 422;
        this.code = "VALIDATION_ERROR";

        Object.setPrototypeOf(this, ValidationError.prototype);
    }
}

@Catch(ValidationError)
export class ValidationExceptionFilter implements ExceptionFilter {
    catch(exception: ValidationError, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        const httpResponseError = new HttpResponseError(request, {
            status: HttpStatus.UNPROCESSABLE_ENTITY,
            message: exception.message,
            error: "VALIDATION_ERROR"
        });

        response.status(httpResponseError.status).json(httpResponseError);
    }
}
