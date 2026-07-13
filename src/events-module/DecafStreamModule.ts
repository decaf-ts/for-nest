import { DynamicModule, Module } from "@nestjs/common";
import { EventsController } from "./EventsController";
import { RouterModule } from "@nestjs/core";
import {
  LISTENING_ADAPTERS_FLAVOURS,
  OBSERVER_EVENTS_OPTIONS,
} from "./constant";
import { DecafRequestContext } from "../request";
import { ObserverSubscriptionRegistry } from "./ObserverSubscriptionRegistry";
import { ObserverEventsOptions } from "../types";
import { EventsSubscriptionController } from "./EventsSubscriptionController";

@Module({})
export class DecafStreamModule {
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
        DecafRequestContext,
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
