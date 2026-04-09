import { applyDecorators, SetMetadata, UseInterceptors } from "@nestjs/common";
import { Constructor } from "@decaf-ts/decoration";
import { AUTH_META_KEY } from "../../constants";
import { ApiBearerAuth } from "@nestjs/swagger";
import { AuthInterceptor } from "../../interceptors/AuthInterceptor";

/**
 * A decorator function that applies authentication and authorization metadata to a NestJS controller or method.
 *
 * @param model - The model name or constructor function for the resource being accessed.
 * If a string is provided, it is used as the resource name.
 * If a constructor function is provided, its name is used as the resource name.
 *
 * @returns - A function that applies the authentication and authorization decorators to the target.
 *
 * @example
 * ```typescript
 * @Controller('users')
 * @Auth('User')
 * export class UsersController {
 *   // ...
 * }
 * ```
 *
 * @example
 * ```typescript
 * @Controller('users')
 * @Auth(User)
 * export class UsersController {
 *   // ...
 * }
 * ```
 */
export function Auth(model?: string | Constructor) {
  const resource = model
    ? typeof model === "string"
      ? model
      : model.name
    : undefined;
  const decs = [ApiBearerAuth(), UseInterceptors(AuthInterceptor)];
  if (resource) decs.push(SetMetadata(AUTH_META_KEY, resource));
  return applyDecorators(...decs);
}
