import { Request } from "express";
import { HttpStatus } from "@nestjs/common";

export class HttpResponseError {
	status!: number;
	error!: string;
	message!: string;
	timestamp!: string;
	path!: string;
	method!: string;

	constructor(
		request: Request,
		responseError?: { status?: number; message?: string; error?: string }
	) {
		const status = responseError?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
		const message = responseError?.message ?? "Internal Server Error";
		const error = (responseError?.error ?? HttpStatus[status] ?? "HTTP_EXCEPTION")
			.toString()
			.toUpperCase();

		Object.assign(this, {
			status,
			message,
			error,
			timestamp: new Date().toISOString(),
			path: request.url,
			method: request.method,
		});
	}
}
