import { Body, Controller, Inject, Post } from "@nestjs/common";
import { UUID } from "@decaf-ts/core";
import { DecafRequestContext } from "../request";
import { DecafController } from "../controllers";
import { DecafServerCtx } from "../constants";
import { OBSERVER_EVENTS_OPTIONS } from "./constant";
import type { ObserverEventsOptions } from "../types";
import { ObserverSubscriptionRegistry } from "./ObserverSubscriptionRegistry";

type SubscriptionPayload = {
  subscriberId?: string;
  topics?: string[];
};

@Controller()
export class EventsSubscriptionController extends DecafController<DecafServerCtx> {
  constructor(
    clientContext: DecafRequestContext,
    @Inject(OBSERVER_EVENTS_OPTIONS) private readonly options: ObserverEventsOptions,
    private readonly registry: ObserverSubscriptionRegistry
  ) {
    super(clientContext, EventsSubscriptionController.name);
  }

  @Post("subscribe")
  async subscribe(
    @Body() body: SubscriptionPayload
  ): Promise<Record<string, any>> {
    if (!this.options.subscriptionMode) {
      return { enabled: false };
    }
    const subscriberId =
      body?.subscriberId || (await Promise.resolve(UUID.instance.generate()));
    const topics = Array.isArray(body?.topics) ? body.topics : [];
    const record = this.registry.upsert(subscriberId, topics);
    return {
      subscriberId: record.subscriberId,
      topics: this.registry.topicsFor(record.subscriberId),
    };
  }

  @Post("unsubscribe")
  unsubscribe(@Body() body: SubscriptionPayload): Record<string, any> {
    if (!this.options.subscriptionMode) {
      return { enabled: false };
    }
    const subscriberId = body?.subscriberId;
    if (!subscriberId) {
      return { unsubscribed: false };
    }
    return {
      unsubscribed: this.registry.remove(subscriberId),
      subscriberId,
    };
  }
}
