import { Adapter } from "@decaf-ts/core";
import { Constructor } from "@decaf-ts/decoration";

/**
 * @publicApi
 */
export type DecafModuleOptions<
  CONF = any,
  A extends Adapter<CONF, any, any, any, any> = Adapter<CONF, any, any>,
> = {
  adapter: Constructor<A>;
  conf: CONF;
  alias?: string;
};
