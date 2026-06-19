import { Adapter, ConfigOf } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { Type } from "@nestjs/common";
import { DecafRequestHandler } from "../types";

export interface DecafWebhookModuleOptions<
  CONF = any,
  A extends Adapter<CONF, any, any, any> = Adapter<CONF, any, any, any>,
> {
  conf: [
    Constructor<A>,
    ConfigOf<A>,
    ...args:
      | any[]
      | [
          ...any[],
          any,
        ],
  ][];
  handlers?: Type<DecafRequestHandler>[];
  initialization?: () => Promise<void>;
  /**
   * Router prefix for the webhook controllers.
   * @default "/webhooks"
   */
  webhookApiPath?: string;
}
