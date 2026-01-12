import { AdapterFlags, Context } from "@decaf-ts/core";
import { Logger } from "@decaf-ts/logging";

export const DECAF_MODULE_OPTIONS = "DecafModuleOptions";
export const DECAF_ADAPTER_ID = "DecafAdapter";

export const DECAF_ROUTE = "DecafRoute";
export const DECAF_HANDLERS = Symbol("DecafHandlers");
export const DECAF_ADAPTER_OPTIONS = Symbol("DecafAdapterForOptions");

export const AUTH_HANDLER = Symbol("AUTH_HANDLER");
export const AUTH_META_KEY = "auth:meta";

export const AuthRole = "AuthRole";

export const DECAF_CONTEXT_KEY = "decaf:context";

export type DecafServerFlags<LOG extends Logger = Logger> =
  AdapterFlags<LOG> & {
    headers: Record<string, any>;
  };

export type DecafServerContext = Context<DecafServerFlags>;
