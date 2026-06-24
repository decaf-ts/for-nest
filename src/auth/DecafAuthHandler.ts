import { ExecutionContext } from "@nestjs/common";
import { Metadata } from "@decaf-ts/decoration";
import { AuthorizationError, PersistenceKeys } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";

import type { AuthHandler } from "../types";
import { DecafRequestContext } from "../request/DecafRequestContext";

export class DecafAuthHandler implements AuthHandler {
  protected parseRequest(req: any) {
    const userRole = req.headers.authorization?.split(" ")[1] as string;
    return userRole;
  }

  async authorize(
    ctx: ExecutionContext,
    resource: string,
    context?: DecafRequestContext,
    requiredRoles?: string[]
  ) {
    const req = ctx.switchToHttp().getRequest();

    const userRole = this.parseRequest(req);
    if (!userRole) throw new AuthorizationError("Unauthenticated");

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(userRole)) {
        throw new AuthorizationError(`Missing required role: ${userRole}`);
      }
    }

    const roles = Metadata.get(Model.get(resource)!, PersistenceKeys.AUTH_ROLE);

    if (roles && !roles.includes(userRole)) {
      throw new AuthorizationError(`Missing role: ${userRole}`);
    }

    if (context) {
      context.accumulate({
        UUID: userRole,
      } as any);
    }
  }
}

export class DecafRoleAuthHandler extends DecafAuthHandler {
  constructor() {
    super();
  }

  override async authorize(
    ctx: ExecutionContext,
    resource: string,
    context?: DecafRequestContext,
    requiredRoles?: string[]
  ) {
    const req = ctx.switchToHttp().getRequest();

    const userRole = this.parseRequest(req);
    if (!userRole) throw new AuthorizationError("Unauthenticated");

    if (requiredRoles && requiredRoles.length > 0) {
      if (!requiredRoles.includes(userRole)) {
        throw new AuthorizationError(`Missing required role: ${userRole}`);
      }
    }

    const roles = Metadata.get(Model.get(resource)!, PersistenceKeys.AUTH_ROLE);

    if (roles && !roles.includes(userRole)) {
      throw new AuthorizationError(`Missing role: ${userRole}`);
    }

    if (context) {
      context.accumulate({
        UUID: userRole,
      } as any);
    }

    return roles;
  }
}
