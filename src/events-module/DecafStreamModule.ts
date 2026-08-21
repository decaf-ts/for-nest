import { DynamicModule, Module } from "@nestjs/common";
import { EventsController } from "./EventsController";
import { RouterModule } from "@nestjs/core";
import {
  LISTENING_ADAPTERS_FLAVOURS,
  OBSERVER_EVENTS_OPTIONS,
} from "./constant";
import { ObserverSubscriptionRegistry } from "./ObserverSubscriptionRegistry";
import { ObserverEventsOptions } from "../types";
import { EventsSubscriptionController } from "./EventsSubscriptionController";

/**
 * @description NestJS dynamic module wiring the SSE events stack into an application
 * @summary Creates a NestJS module that registers the {@link EventsController} (and,
 * when subscription mode is enabled, the {@link EventsSubscriptionController}) under a
 * given router path, together with the {@link ObserverSubscriptionRegistry} provider and
 * the adapter flavours and options used to observe and stream events.
 * @class DecafStreamModule
 * @memberOf module:for-nest.events
 */
@Module({})
export class DecafStreamModule {
  /**
   * @description Builds the dynamic SSE module for the given adapter flavours
   * @summary Returns a {@link DynamicModule} exposing the SSE controllers under the
   * given `path` (default `events`), with the {@link ObserverSubscriptionRegistry} and
   * the flavour/options providers registered. The subscription controller is only
   * added when `options.subscriptionMode` is truthy.
   * @param {string[]} flavours - The adapter flavours to observe events on
   * @param {string} [path=events] - The router path the SSE endpoints are mounted on
   * @param {ObserverEventsOptions} [options={}] - Observer events configuration
   * @returns {DynamicModule} The configured dynamic module
   * @mermaid
   * sequenceDiagram
   *   participant App
   *   participant Module as DecafStreamModule
   *   participant Router as RouterModule
   *   App->>Module: forFlavours(flavours, path, options)
   *   Module->>Router: register({ path, module })
   *   alt options.subscriptionMode
   *     Module->>Module: add EventsSubscriptionController
   *   end
   *   Module->>Module: register ObserverSubscriptionRegistry
   *   Module-->>App: DynamicModule
   */
  static forFlavours(
    flavours: string[],
    path: string = "events",
    options: ObserverEventsOptions = {}
  ): DynamicModule {
    const controllers: any[] = [EventsController];
    if (options.subscriptionMode) {
      controllers.push(EventsSubscriptionController);
    }
    return {
      module: DecafStreamModule,
      controllers,
      imports: [
        RouterModule.register([
          {
            path: path.replace(/^\//, ""),
            module: DecafStreamModule,
          },
        ]),
      ],
      providers: [
        ObserverSubscriptionRegistry,
        {
          provide: LISTENING_ADAPTERS_FLAVOURS,
          useValue: flavours ?? [],
        },
        {
          provide: OBSERVER_EVENTS_OPTIONS,
          useValue: options ?? {},
        },
      ],
    };
  }
}
