import {ArgumentsHost, Catch, ExceptionFilter, HttpException} from "@nestjs/common";
import {Request, Response} from "express";
import {HttpResponseError} from "./HttpResponseError";

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const status = exception.getStatus();

        const httpResponseError = new HttpResponseError(request, {
            status,
            message: exception.message,
            error: exception.name
        });

        response.status(httpResponseError.status).json(httpResponseError);
    }
}
