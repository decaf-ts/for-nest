import { applyDecorators, SetMetadata, UseInterceptors } from "@nestjs/common";
import { Constructor } from "@decaf-ts/decoration";
import { AUTH_META_KEY, AuthRole } from "../../constants";
import { AuthInterceptor } from "../../interceptors/AuthInterceptor";
import { metadata } from "@decaf-ts/decoration";
import { ApiBearerAuth } from "@nestjs/swagger";

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
export function Auth(model: string | Constructor) {
  const resource = typeof model === "string" ? model : model.name;

  return applyDecorators(
    ApiBearerAuth(),
    SetMetadata(AUTH_META_KEY, resource),
    UseInterceptors(AuthInterceptor)
  );
}

/**
 * A decorator function that sets the roles required for authentication and authorization to the model in NestJS.
 *
 * @param roles - An array of role names required for access.
 *
 * @returns - A function that applies the role decorators to the target.
 *
 * @example
 * ```typescript
 * @model('users')
 * @Roles(['admin'])
 * export class UserModel {
 *  //...
 * }
 *
 */
export const Roles = (roles: string[]) => {
  return metadata(AuthRole, roles);
};
