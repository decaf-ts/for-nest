import { BaseError } from "@decaf-ts/db-decorators";

export class ToManyRequestsError extends BaseError {
  constructor(msg: string | Error ) {
    super(ToManyRequestsError.name, msg , 429);
  }
}