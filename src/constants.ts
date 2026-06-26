import { AdapterFlags, Context } from "@decaf-ts/core";
import { Logger } from "@decaf-ts/logging";

export const DECAF_MODULE_OPTIONS = "DecafModuleOptions";
export const DECAF_ADAPTER_ID = "DecafAdapter";
export const DECAF_TASK_SERVICE_ID = "DecafTaskService";

export const DECAF_ROUTE = "DecafRoute";
export const DECAF_HANDLERS = Symbol("DecafHandlers");
export const DECAF_EXPOSE = "DecafExpose";
export const DECAF_CONTROLLER_CONFIG = "DecafControllerConfig";

export const DECAF_CONTEXT_KEY = Symbol("decaf:context");

export type DecafServerFlags<LOG extends Logger = Logger> =
  AdapterFlags<LOG> & {
    headers: Record<string, any>;
    overrides: Record<string, any>;
  };

export type DecafServerCtx = Context<DecafServerFlags>;
