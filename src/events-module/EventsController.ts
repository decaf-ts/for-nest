import { DecafController } from "../controllers";
import { DecafRequestContext } from "../request";
import { Adapter, Observer, ObserverFilter, UUID } from "@decaf-ts/core";
import type { Constructor } from "@decaf-ts/decoration";
import { Controller, Inject, MessageEvent, Param, Sse } from "@nestjs/common";
import { interval, merge, Observable, Subject } from "rxjs";
import { Logging } from "@decaf-ts/logging";
import {
  LISTENING_ADAPTERS_FLAVOURS,
  OBSERVER_EVENTS_OPTIONS,
} from "./constant";
import { DecafServerCtx } from "../constants";
import {
  eventTopicFor,
  fingerprintLabel,
  normalizeEventResponse,
  resolveRequesterFingerprint,
} from "./utils";
import { map, takeUntil, tap } from "rxjs/operators";
import { ObserverSubscriptionRegistry } from "./ObserverSubscriptionRegistry";
import type { ObserverEventsOptions } from "../types";

const HEARTBEAT_INTERVAL_MS = 15000;

/**
 * @description SSE controller exposing Decaf observer events as a Server-Sent Events stream
 * @summary Registers observers against all listening adapters and streams the events they
 * emit back to the client over SSE. In broadcast mode (the default) every stream gets
 * every event and a requester may open any number of streams (tabs, devices). When
 * {@link ObserverEventsOptions.subscriptionMode} is enabled, events are filtered by the
 * requester's topic subscriptions held in the {@link ObserverSubscriptionRegistry}, and a
 * requester (one client, see {@link resolveRequesterFingerprint}) holds a single stream:
 * a newer stream takes over and ends the previous one.
 * @class EventsController
 * @param {DecafRequestContext} clientContext - The active request context
 * @param {string[]} flavours - The adapter flavours to observe events on (injected via {@link LISTENING_ADAPTERS_FLAVOURS})
 * @param {ObserverEventsOptions} options - Observer events configuration (injected via {@link OBSERVER_EVENTS_OPTIONS})
 * @param {ObserverSubscriptionRegistry} registry - The topic-subscription registry
 * @memberOf module:for-nest.events
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Controller as EventsController
 *   participant Registry as ObserverSubscriptionRegistry
 *   participant Adapters
 *   Client->>Controller: listen()
 *   Controller->>Controller: resolveFingerprint()
 *   opt subscription mode
 *     Controller->>Registry: claimConnection(fingerprint, evict)
 *   end
 *   loop for each adapter
 *     Controller->>Adapters: observe(observer, filter)
 *   end
 *   Adapters-->>Controller: refresh(args)
 *   Controller->>Client: SSE message
 *   Client->>Controller: disconnect
 *   opt subscription mode and claim still current
 *     Controller->>Registry: claim.release(), remove(fingerprint)
 *   end
 */
@Controller()
export class EventsController extends DecafController<DecafServerCtx> {
  private readonly adapters: Adapter<any, any, any, any>[];

  constructor(
    clientContext: DecafRequestContext,
    @Inject(LISTENING_ADAPTERS_FLAVOURS) flavours: string[],
    @Inject(OBSERVER_EVENTS_OPTIONS) private readonly options: ObserverEventsOptions,
    private readonly registry: ObserverSubscriptionRegistry
  ) {
    super(clientContext, EventsController.name);
    this.adapters = flavours.map((flavour) => (Adapter as any).get(flavour)); // change to Adapter.cache("")
  }

  /**
   * @description Resolves the request's requester fingerprint
   * @summary Delegates to {@link resolveRequesterFingerprint}, falling back to a
   * freshly generated id so every anonymous SSE connection still gets a stable key.
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
   * @description Streams observer events for all models over SSE
   * @summary Opens the heartbeat-augmented SSE stream for the requesting client.
   * See {@link EventsController} for the broadcast and subscription semantics.
   * @returns {Observable<MessageEvent>} The merged event and heartbeat SSE stream
   */
  @Sse()
  listen(): Observable<MessageEvent> {
    return this.stream({ heartbeat: true });
  }

  /**
   * @description Streams observer events for a single model over SSE
   * @summary Streams the raw observer arguments, without heartbeat. In
   * subscription mode only events whose topic targets the given model (or topic
   * prefix) and match the requester's subscriptions are sent; in broadcast mode
   * the stream is not filtered.
   * @param {string} model - The model name (or topic prefix) to observe events for
   * @returns {Observable<MessageEvent>} The SSE stream for the model
   */
  @Sse("/:model")
  listenForModel(@Param("model") model: string): Observable<MessageEvent> {
    return this.stream({ scope: model, raw: true });
  }

  /**
   * @description Builds the SSE stream for the requesting client
   * @summary Registers an observer on every listening adapter and, optionally,
   * merges its events with a `heartbeat` every 15 seconds. In subscription mode
   * events are filtered to the `scope` model and to the requester's subscriptions,
   * and the stream claims the requester's fingerprint: a newer stream from the
   * same client ends this one, and closing the current stream drops the client's
   * subscriptions (a reconnecting client subscribes again).
   * @param {Object} [options] - Stream options
   * @param {string} [options.scope] - Model (or topic prefix) the stream is restricted to in subscription mode
   * @param {boolean} [options.raw] - Send the raw observer arguments instead of the normalized event
   * @param {boolean} [options.heartbeat] - Emit a heartbeat every 15 seconds
   * @returns {Observable<MessageEvent>} The SSE stream
   */
  private stream(
    options: { scope?: string; raw?: boolean; heartbeat?: boolean } = {}
  ): Observable<MessageEvent> {
    const { scope, raw, heartbeat } = options;
    const logger = Logging.for(EventsController.name);
    const subscriptionMode = Boolean(this.options.subscriptionMode);
    const fingerprint = this.resolveFingerprint();
    const ended$ = new Subject<void>();

    const events$ = new Observable<MessageEvent>((subscriber) => {
      const observerId =
        `B-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

      logger.info(
        `Creating SSE observer: ${observerId} for client ${this.clientContext.uuid} (fingerprint ${fingerprintLabel(fingerprint)})`
      );
      const claim = subscriptionMode
        ? this.registry.claimConnection(fingerprint, () => {
            logger.info(
              `SSE observer ${observerId} superseded by a newer stream of the same client (fingerprint ${fingerprintLabel(fingerprint)})`
            );
            ended$.next();
            subscriber.complete();
          })
        : undefined;

      const cb = new (class implements Observer {
        observerId = observerId;
        refresh(...args: any[]): Promise<void> {
          logger.debug(
            `SSE observer ${this.observerId} received refresh event`
          );
          return Promise.resolve().then(() => {
            if (raw) {
              subscriber.next({ data: args } as MessageEvent);
              return;
            }
            const data = normalizeEventResponse(args);
            subscriber.next({ type: "message", data });
            logger.debug(
              `SSE observer ${this.observerId} event pushed to client`
            );
          });
        }
      })();

      const filter: ObserverFilter | undefined = subscriptionMode
        ? (model: string | Constructor, event: any, id: any, ..._rest: any[]) => {
            const topic = eventTopicFor(model, event, id);
            if (!topic) return false;
            if (scope && topic !== scope && !topic.startsWith(`${scope}.`))
              return false;
            return this.registry.matches(fingerprint, topic);
          }
        : undefined;

      logger.verbose(
        `Registering observer ${observerId} across ${this.adapters.length} adapter(s)`
      );
      for (const adapter of this.adapters) {
        const adapterName = adapter?.constructor?.name ?? "UnknownAdapter";
        try {
          logger.debug(
            `Registering observer ${observerId} in adapter ${adapterName}`
          );
          adapter.observe(cb, filter);
        } catch (e: any) {
          logger.debug(
            `Failed to register observer ${observerId} in adapter ${adapterName}: ${e?.message || e}`
          );
          logger.error(e);
        }
      }

      return () => {
        logger.debug(`Cleaning up SSE observer ${observerId}`);

        for (const adapter of this.adapters) {
          const adapterName = adapter?.constructor?.name ?? "UnknownAdapter";
          try {
            logger.debug(
              `Unregistering observer ${observerId} from adapter ${adapterName}`
            );
            adapter.unObserve(cb);
          } catch (e: any) {
            logger.debug(
              `Failed during cleanup of observer ${observerId} in adapter ${adapterName}: ${e?.message || e}`
            );
            logger.error(e);
          }
        }
        // a superseded stream leaves the newer stream's claim and subscriptions alone
        if (claim?.release()) this.registry.remove(fingerprint);
        ended$.next();
        ended$.complete();
      };
    });

    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
      takeUntil(ended$),
      tap(() => {
        logger.debug("Sending heartbeat");
      }),
      map(
        (): MessageEvent => ({
          type: "heartbeat",
          data: {
            ts: new Date().toISOString(),
          },
        })
      )
    );

    return heartbeat ? merge(events$, heartbeat$) : events$;
  }
}
