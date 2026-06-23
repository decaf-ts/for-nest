import { Metadata } from "@decaf-ts/decoration";
import type { ModelControllerFactoryConfig } from "@decaf-ts/for-http/server";

import { DECAF_CONTROLLER_CONFIG } from "../../constants";

/**
 * Class decorator that attaches a {@link ModelControllerFactoryConfig} to a Model,
 * so `FromModelController.create()` can pass it to `ModelControllerFactory.create()`.
 *
 * The per-model config can be overridden by the module-level `controllerConfig`
 * option in `DecafModuleOptions`.
 *
 * @example
 * ```ts
 * @controllerConfig({ allowGroupingQueries: true, allowBulkStatement: { create: true, read: true, update: false, delete: true } })
 * @model()
 * class Order extends Model<Order> { ... }
 * ```
 *
 * @param config - Factory configuration knobs (allowStatementlessQuery, allowGroupingQueries, allowBulkStatement).
 */
export function controllerConfig(config: ModelControllerFactoryConfig) {
  return function controllerConfigDecorator(target: any) {
    Metadata.set(target, DECAF_CONTROLLER_CONFIG, config as any);
    return target;
  };
}
