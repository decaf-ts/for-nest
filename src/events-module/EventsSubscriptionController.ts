import { Body, Controller, Inject, Post } from "@nestjs/common";
import { UUID } from "@decaf-ts/core";
import { DecafRequestContext } from "../request";
import { DecafController } from "../controllers";
import { DecafServerCtx } from "../constants";
import { OBSERVER_EVENTS_OPTIONS } from "./constant";
import type { ObserverEventsOptions } from "../types";
import { fingerprintLabel, resolveRequesterFingerprint } from "./utils";
import { ObserverSubscriptionRegistry } from "./ObserverSubscriptionRegistry";

/**
 * @description REST payload for subscribing an SSE client to topics
 * @summary The request body accepted by the subscribe endpoint: an optional list
 * of webhook-style topic patterns.
 * @typedef {Object} SubscriptionPayload
 * @property {string[]} [topics] - The topics to subscribe the requester to
 * @memberOf module:for-nest.events
 */
type SubscriptionPayload = {
  topics?: string[];
};

/**
 * @description REST controller managing SSE topic subscriptions
 * @summary Exposes `POST subscribe` and `POST unsubscribe` endpoints that upsert or
 * remove the requester's topic subscriptions in the {@link ObserverSubscriptionRegistry}.
 * Both endpoints no-op with `{ enabled: false }` when subscription mode is disabled.
 * @class EventsSubscriptionController
 * @param {DecafRequestContext} clientContext - The active request context
 * @param {ObserverEventsOptions} options - Observer events configuration (injected via {@link OBSERVER_EVENTS_OPTIONS})
 * @param {ObserverSubscriptionRegistry} registry - The topic-subscription registry
 * @memberOf module:for-nest.events
 */
@Controller()
export class EventsSubscriptionController extends DecafController<DecafServerCtx> {
  constructor(
    clientContext: DecafRequestContext,
    @Inject(OBSERVER_EVENTS_OPTIONS) private readonly options: ObserverEventsOptions,
    private readonly registry: ObserverSubscriptionRegistry
  ) {
    super(clientContext, EventsSubscriptionController.name);
  }

  /**
   * @description Resolves the request's requester fingerprint
   * @summary Delegates to {@link resolveRequesterFingerprint}, falling back to a
   * freshly generated id so every anonymous request still gets a stable key.
   * @returns {string} The resolved fingerprint value
   */
  private resolveFingerprint(): string {
    const { value } = resolveRequesterFingerprint(
      {
        getOrUndefined: (key: string) => this.clientContext.getOrUndefined(key as any),
        headers: this.clientContext.headers,
      },
      `${UUID.instance.generate()}`
    );
    return value;
  }

  /**
   * @description Subscribes the requester to a set of webhook topics
   * @summary Upserts the requester's topic subscriptions in the registry and returns
   * the stored (sanitized) topics plus a truncated fingerprint label. Returns
   * `{ enabled: false }` when subscription mode is disabled.
   * @param {SubscriptionPayload} body - The topics to subscribe to
   * @returns {Promise<Record<string, any>>} `{ enabled, fingerprint, topics }` or `{ enabled: false }`
   * @mermaid
   * sequenceDiagram
   *   participant Client
   *   participant Controller as EventsSubscriptionController
   *   participant Registry as ObserverSubscriptionRegistry
   *   Client->>Controller: POST subscribe { topics }
   *   alt subscription mode disabled
   *     Controller-->>Client: { enabled: false }
   *   else
   *     Controller->>Controller: resolveFingerprint()
   *     Controller->>Registry: upsert(fingerprint, topics)
   *     Registry-->>Controller: record
   *     Controller-->>Client: { fingerprint, topics }
   *   end
   */
  @Post("subscribe")
  async subscribe(@Body() body: SubscriptionPayload): Promise<Record<string, any>> {
    if (!this.options.subscriptionMode) {
      return { enabled: false };
    }
    const topics = Array.isArray(body?.topics) ? body.topics : [];
    const fingerprint = this.resolveFingerprint();

    const record = this.registry.upsert(fingerprint, topics);
    return {
      fingerprint: fingerprintLabel(record.fingerprint),
      topics: this.registry.topicsFor(record.fingerprint),
    };
  }

  /**
   * @description Removes the requester's topic subscriptions
   * @summary Deletes the requester's record from the registry and reports whether a
   * subscription existed. Returns `{ enabled: false }` when subscription mode is
   * disabled.
   * @returns {Record<string, any>} `{ enabled, unsubscribed, fingerprint }` or `{ enabled: false }`
   */
  @Post("unsubscribe")
  unsubscribe(): Record<string, any> {
    if (!this.options.subscriptionMode) {
      return { enabled: false };
    }
    const fingerprint = this.resolveFingerprint();
    return {
      unsubscribed: this.registry.remove(fingerprint),
      fingerprint: fingerprintLabel(fingerprint),
    };
  }
}
