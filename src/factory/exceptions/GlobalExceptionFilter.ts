import {ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus} from "@nestjs/common";
import {Request, Response} from "express";
import {HttpResponseError} from "./HttpResponseError";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const request = ctx.getRequest<Request>();
        const response = ctx.getResponse<Response>();

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let message = "Internal Server Error";
        let error: string | undefined;

        if (exception instanceof HttpException) {
            const res: any = exception.getResponse();
            status = exception.getStatus();
            message = (res?.message || exception.message) ?? message;
            error = res?.error ?? exception.name;
        } else if (exception instanceof Error) {
            message = exception.message;
            error = exception.name;
        }

        const httpResponseError = new HttpResponseError(request, {status, message, error});
        response.status(httpResponseError.status).json(httpResponseError);
    }
}
