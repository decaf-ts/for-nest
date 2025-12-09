import { Adapter } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";
import { Type } from "@nestjs/common";

export interface RequestContextAccessor {
  set(key: string | symbol, value: any): void;
  get<T = any>(key: string | symbol): T | undefined;
}

export interface DecafRequestHandler {
  handle(
    context: RequestContextAccessor,
    req: Request,
    res: Response
  ): Promise<void>;
}

/**
 * @publicApi
 */
export type DecafModuleOptions<
  CONF = any,
  A extends Adapter<CONF, any, any, any> = Adapter<CONF, any, any, any>,
> = {
  adapter: Constructor<A>;
  conf: CONF;
  alias?: string;
  autoControllers: boolean;
  handlers?: Type<DecafRequestHandler>[];
};
