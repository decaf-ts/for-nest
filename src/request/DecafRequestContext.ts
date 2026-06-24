import { Inject, Injectable, Scope } from "@nestjs/common";
import { REQUEST } from "@nestjs/core";
import { UUID } from "@decaf-ts/core";
import { RequestContext } from "@decaf-ts/for-http/server";
import { type Request } from "express";

import { DecafServerCtx } from "../constants";

@Injectable({ scope: Scope.REQUEST })
export class DecafRequestContext<C extends DecafServerCtx = DecafServerCtx> extends RequestContext<Request> {
  uuid = UUID.instance.generate();
  override readonly request: Request;

  constructor(@Inject(REQUEST) private readonly req: Request) {
    super(
      {
        headersOf: (request: Request) => (request as any)?.headers || undefined,
      } as any,
      req
    );
    this.request = req;
  }

  put(record: Record<any, any>) {
    let overrides: any;
    try {
      overrides = this.get("overrides");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      overrides = {};
    }

    this.accumulate({
      overrides: Object.assign(overrides, record),
    });
  }
}
