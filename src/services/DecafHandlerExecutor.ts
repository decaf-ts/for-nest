import { Inject, Injectable, Scope } from "@nestjs/common";
import { DecafRequestContext } from "./DecafRequestContext";
import { type DecafRequestHandler } from "../types";
import { DECAF_HANDLERS } from "../constants";

@Injectable({ scope: Scope.REQUEST })
export class DecafHandlerExecutor {
  constructor(
    @Inject(DECAF_HANDLERS) private readonly handlers: DecafRequestHandler[],
    private readonly context: DecafRequestContext
  ) {}

  async exec(req: Request) {
    for (const handler of this.handlers) {
      await handler.handle(this.context, req);
    }
  }
}
