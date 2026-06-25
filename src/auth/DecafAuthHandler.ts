import { ExecutionContext } from "@nestjs/common";
import { AuthorizationError } from "@decaf-ts/core";
import { AuthHandler, AuthData } from "@decaf-ts/for-http/server";
import { DecafRequestContext } from "../request/DecafRequestContext";

/**
 * Simple auth handler that reads a role string from the `Authorization: Bearer <role>` header.
 *
 * Only overrides {@link AuthHandler.extractFromAuth} to return the bearer token as
 * both the user identifier and the single role. The base class `bindToContext`
 * (`ctx.accumulate(data)`) is sufficient — the transformer/adapter is responsible
 * for mapping context fields to adapter-specific keys like `UUID`.
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
}

/**
 * Alias for {@link DecafAuthHandler} kept for backward compatibility.
 * The "role" variant previously returned roles from `authorize`; with the base
 * class now orchestrating role checks internally, the two classes are equivalent.
 */
export class DecafRoleAuthHandler extends DecafAuthHandler {}
