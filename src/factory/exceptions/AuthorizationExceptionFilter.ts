import {ArgumentsHost, Catch, ExceptionFilter, HttpStatus} from "@nestjs/common";
import {Request, Response} from "express";
import {HttpResponseError} from "./HttpResponseError";

export class AuthorizationError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(message = "Unauthorized") {
        super(message);
        this.name = "AuthorizationError";
        this.status = 401;
        this.code = "UNAUTHORIZED";
        Object.setPrototypeOf(this, AuthorizationError.prototype);
    }
}

@Catch(AuthorizationError)
export class AuthorizationExceptionFilter implements ExceptionFilter {
    catch(exception: AuthorizationError, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        const httpResponseError = new HttpResponseError(request, {
            error: "UNAUTHORIZED",
            status: HttpStatus.UNAUTHORIZED,
            message: exception.message,
        });

        response.status(HttpStatus.UNAUTHORIZED).json(httpResponseError);
    }
}
