import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { Request, Response } from "express";
import { HttpResponseError } from "./HttpResponseError";

export class NotFoundError extends Error {
	readonly status: number;
	readonly code: string;

	constructor(message = "Resource not found") {
		super(message);
		this.name = "NotFoundError";
		this.status = 404;
		this.code = "NOT_FOUND";

		Object.setPrototypeOf(this, NotFoundError.prototype);
	}
}

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

		response.status(httpResponseError.status).json(httpResponseError);
	}
}
