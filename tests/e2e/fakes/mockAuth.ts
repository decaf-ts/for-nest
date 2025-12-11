import { ExecutionContext, Injectable } from "@nestjs/common";
import { Metadata } from "@decaf-ts/decoration";
import { AuthorizationError } from "@decaf-ts/core";
import { Model } from "@decaf-ts/decorator-validation";
import { AuthHandler } from "../../../src/types";
import { AuthRole } from "../../../src";

@Injectable()
export class MockAuthHandler implements AuthHandler {
  async authorize(ctx: ExecutionContext, resource: string) {
    const req = ctx.switchToHttp().getRequest();
    const userRole = req.headers.authorization?.split(" ")[1] as string;

    if (!userRole) throw new AuthorizationError("Unauthenticated");

    const roles = Metadata.get(Model.get(resource)!, AuthRole);

    if (!roles.includes(userRole)) {
      throw new AuthorizationError(`Missing role: ${userRole}`);
    }
  }
}
