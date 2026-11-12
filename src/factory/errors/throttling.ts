import { BaseError } from "@decaf-ts/db-decorators";

/**
 * @deprecated Use `TooManyRequestsError` from `@decaf-ts/for-http` — the error shared with
 * the HttpAdapter client (the exception filter now answers 429 with it).
 */
export class ToManyRequestsError extends BaseError {
  constructor(msg: string | Error) {
    super(ToManyRequestsError.name, msg, 429);
  }
}
