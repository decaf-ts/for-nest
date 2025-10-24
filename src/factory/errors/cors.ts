import {ConnectionError, ForbiddenError} from "@decaf-ts/core";

export class CorsError extends ForbiddenError {
	constructor(msg: string | Error) {
		super(msg, CorsError.name);
	}
}