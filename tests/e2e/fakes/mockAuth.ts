import { ExecutionContext, Injectable } from "@nestjs/common";
import { DecafRoleAuthHandler } from "../../../src/request/DecafAuthHandler";
import type { Constructor } from "@decaf-ts/decoration";

@Injectable()
export class MockAuthHandler extends DecafRoleAuthHandler {
  constructor() {
    super();
  }

  override async authorize(
    ctx: ExecutionContext,
    resource?: string | Constructor
  ): Promise<any> {
    if (!resource) {
      return;
    }
    return super.authorize(ctx, resource);
  }
}
