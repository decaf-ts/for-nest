import { ExecutionContext } from "@nestjs/common";
import { AuthorizationError, Context } from "@decaf-ts/core";
import { AuthHandler, AuthData } from "@decaf-ts/for-http/server";
import { DecafRequestContext } from "../request/DecafRequestContext";

/**
 * Simple auth handler that reads a role string from the `Authorization: Bearer <role>` header.
 *
 * Extends the framework-agnostic {@link AuthHandler} and overrides
 * {@link AuthHandler.extractFromAuth} to return the bearer token as both the user identifier
 * and the single role, and {@link AuthHandler.bindToContext} to accumulate `UUID` and
 * `organization` onto the request context.
 */
export class DecafAuthHandler extends AuthHandler<
  ExecutionContext,
  DecafRequestContext,
  AuthData
> {
  protected parseRequest(req: any): string {
    const userRole = req.headers.authorization?.split(" ")[1] as string;
    return userRole;
  }

  protected extractFromAuth(ctx: ExecutionContext): AuthData {
    const req = ctx.switchToHttp().getRequest();
    const userRole = this.parseRequest(req);
    if (!userRole) throw new AuthorizationError("Unauthenticated");
    return { user: userRole, roles: [userRole] };
  }

  protected bindToContext(
    context: DecafRequestContext,
    data: AuthData,
    _ctx?: ExecutionContext
  ): void {
    context.accumulate({
      UUID: data.user,
      organization: data.organization,
    });
  }
}

/**
 * Alias for {@link DecafAuthHandler} kept for backward compatibility.
 * The "role" variant previously returned roles from `authorize`; with the base
 * class now orchestrating role checks internally, the two classes are equivalent.
 */
export class DecafRoleAuthHandler extends DecafAuthHandler {}
