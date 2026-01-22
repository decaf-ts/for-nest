import { ExecutionContext } from "@nestjs/common";
import { Metadata } from "@decaf-ts/decoration";
import { AuthorizationError, PersistenceKeys } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { AuthHandler } from "../types";

export class DecafAuthHandler implements AuthHandler {
  protected parseRequest(req: any) {
    const userRole = req.headers.authorization?.split(" ")[1] as string;
    return userRole;
  }

  async authorize(ctx: ExecutionContext, resource: string) {
    const req = ctx.switchToHttp().getRequest();

    const userRole = this.parseRequest(req);
    if (!userRole) throw new AuthorizationError("Unauthenticated");

    const roles = Metadata.get(Model.get(resource)!, PersistenceKeys.AUTH_ROLE);

    if (!roles.includes(userRole)) {
      throw new AuthorizationError(`Missing role: ${userRole}`);
    }
  }
}

export class DecafRoleAuthHandler extends DecafAuthHandler {
  constructor() {
    super();
  }

  override async authorize(ctx: ExecutionContext, resource: string) {
    const req = ctx.switchToHttp().getRequest();

    const userRole = this.parseRequest(req);
    if (!userRole) throw new AuthorizationError("Unauthenticated");

    const roles = Metadata.get(Model.get(resource)!, PersistenceKeys.AUTH_ROLE);

    if (!roles.includes(userRole)) {
      throw new AuthorizationError(`Missing role: ${userRole}`);
    }
    return roles;
  }
}
