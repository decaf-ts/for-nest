import { Inject, Injectable, Scope } from "@nestjs/common";
import { DecafServerCtx } from "../constants";
import { InternalError } from "@decaf-ts/db-decorators";
import { REQUEST } from "@nestjs/core";

@Injectable({ scope: Scope.REQUEST })
export class DecafRequestContext<C extends DecafServerCtx = DecafServerCtx> {
  private _ctx?: C;

  constructor(@Inject(REQUEST) private readonly req: Request) {}

  get request(): Record<string | symbol, any> {
    return this.req;
  }

  put(record: Record<any, any>) {
    let overrides: any;
    try {
      overrides = this.ctx.get("overrides");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      overrides = {};
    }

    this._ctx = this.ctx.accumulate({
      overrides: Object.assign(overrides, record),
    }) as any;
  }

  applyCtx(ctx: C) {
    this._ctx = ctx;
  }

  get ctx(): C {
    if (!this._ctx)
      throw new InternalError(`Context not initialized for request`);
    return this._ctx;
  }
}
