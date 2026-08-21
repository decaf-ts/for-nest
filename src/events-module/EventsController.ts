import { DecafController } from "../controllers";
import { DecafRequestContext } from "../request";
import { Adapter, Observer, ObserverFilter, UUID } from "@decaf-ts/core";
import type { Constructor } from "@decaf-ts/decoration";
import {
  Controller,
  Inject,
  MessageEvent,
  Query,
  Sse,
} from "@nestjs/common";
import { interval, merge, Observable } from "rxjs";
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
import { map, tap } from "rxjs/operators";
import { ObserverSubscriptionRegistry } from "./ObserverSubscriptionRegistry";
import type { ObserverEventsOptions } from "../types";
import { ConflictError } from "@decaf-ts/db-decorators";

/**
 * @description SSE controller exposing Decaf observer events as a Server-Sent Events stream
 * @summary Registers observers against all listening adapters and streams the events they
 * emit back to the client over SSE. A single requester (identified by fingerprint) may hold
 * only one SSE connection: claiming a connection when one is already active throws a
 * {@link ConflictError}. When {@link ObserverEventsOptions.subscriptionMode} is enabled,
 * events are filtered by the requester's topic subscriptions held in the
 * {@link ObserverSubscriptionRegistry}.
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
 *   Controller->>Registry: claimConnection(fingerprint)
 *   Registry-->>Controller: claimed
 *   loop for each adapter
 *     Controller->>Adapters: observe(observer, filter)
 *   end
 *   Adapters-->>Controller: refresh(args)
 *   Controller->>Client: SSE message
 *   Client->>Controller: disconnect
 *   Controller->>Registry: releaseConnection(fingerprint)
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
   * @description Claims the right to stream events for a fingerprint
   * @summary Enforces the one-SSE-connection-per-client invariant, throwing a
   * {@link ConflictError} when the fingerprint already holds an active connection.
   * @param {string} fingerprint - The requester fingerprint to claim
   * @returns {string} The claimed fingerprint
   * @throws {ConflictError} When the fingerprint already holds an active SSE connection
   */
  private claim(fingerprint: string): string {
    if (!this.registry.claimConnection(fingerprint)) {
      throw new ConflictError(
        "Only one SSE connection is allowed per client; the previous connection must be closed first"
      );
    }
    return fingerprint;
  }

  /**
   * @description Streams observer events for all models over SSE
   * @summary Opens the heartbeat-augmented SSE stream for the requesting client.
   * Claims the requester's fingerprint (one connection per client) and, when
   * subscription mode is enabled, registers an observer whose {@link ObserverFilter}
   * only forwards events whose topic matches the requester's subscriptions. A
   * `heartbeat` message is emitted every 15 seconds to keep the connection alive.
   * On disconnect, the observer is unregistered and the fingerprint released.
   * @returns {Observable<MessageEvent>} The merged event and heartbeat SSE stream
   * @throws {ConflictError} When the requester already holds an active SSE connection
   * @mermaid
   * sequenceDiagram
   *   participant Client
   *   participant Controller as EventsController
   *   participant Registry as ObserverSubscriptionRegistry
   *   participant Adapters
   *   Client->>Controller: GET (SSE)
   *   Controller->>Registry: claimConnection(fingerprint)
   *   Registry-->>Controller: claimed / ConflictError
   *   loop for each adapter
   *     Controller->>Adapters: observe(observer, filter)
   *   end
   *   Adapters-->>Controller: refresh([model, operation, id, payload])
   *   Controller->>Controller: normalizeEventResponse()
   *   Controller->>Client: event message
   *   Controller-->>Client: heartbeat every 15s
   *   Client-->>Controller: disconnect
   *   Controller->>Adapters: unObserve(observer)
   *   Controller->>Registry: releaseConnection(fingerprint)
   */
  @Sse()
  listen(): Observable<MessageEvent> {
    const logger = Logging.for(EventsController.name);
    const subscriptionMode = Boolean(this.options.subscriptionMode);
    const fingerprint = this.claim(this.resolveFingerprint());

    const events$ = new Observable<MessageEvent>((observer) => {
      const observerId =
        `B-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

      logger.info(
        `Creating SSE observer: ${observerId} for client ${this.clientContext.uuid} (fingerprint ${fingerprintLabel(fingerprint)})`
      );
      const cb = new (class implements Observer {
        observerId = observerId;
        refresh(...args: any[]): Promise<void> {
          logger.debug(
            `SSE observer ${this.observerId} received refresh event`
          );
          return Promise.resolve().then(() => {
            const data = normalizeEventResponse(args);
            observer.next({ type: "message", data });
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
        this.registry.releaseConnection(fingerprint);
      };
    });

    const HEARTBEAT_INTERVAL_MS = 15000;
    const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
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

    return merge(events$, heartbeat$);
  }

  /**
   * @description Streams observer events for a single model over SSE
   * @summary Opens an SSE stream restricted to events whose topic targets the given
   * model. When subscription mode is enabled, events are additionally filtered by
   * the requester's topic subscriptions. Observers are registered against all
   * listening adapters and released on disconnect, together with the claimed
   * fingerprint.
   * @param {string} model - The model name (or topic prefix) to observe events for
   * @returns {Observable<MessageEvent>} The SSE stream for the model
   * @throws {ConflictError} When the requester already holds an active SSE connection
   * @mermaid
   * sequenceDiagram
   *   participant Client
   *   participant Controller as EventsController
   *   participant Registry as ObserverSubscriptionRegistry
   *   participant Adapters
   *   Client->>Controller: GET /:model (SSE)
   *   Controller->>Registry: claimConnection(fingerprint)
   *   Registry-->>Controller: claimed / ConflictError
   *   loop for each adapter
   *     Controller->>Adapters: observe(observer, model-filter)
   *   end
   *   Adapters-->>Controller: refresh([model, operation, id, payload])
   *   alt topic targets the model AND matches subscriptions
   *     Controller->>Client: event message
   *   end
   *   Client-->>Controller: disconnect
   *   Controller->>Adapters: unObserve(observer)
   *   Controller->>Registry: releaseConnection(fingerprint)
   */
  @Sse("/:model")
  listenForModel(@Query("model") model: string): Observable<MessageEvent> {
    const logger = Logging.for(EventsController.name);
    const subscriptionMode = Boolean(this.options.subscriptionMode);
    const fingerprint = this.claim(this.resolveFingerprint());

    return new Observable<MessageEvent>((observer) => {
      const cb = new (class implements Observer {
        refresh(...args: any[]): Promise<void> {
          return Promise.resolve().then(() => {
            observer.next({ data: args } as any);
          });
        }
      })();

      const filter: ObserverFilter | undefined = subscriptionMode
        ? (modelConstr: string | Constructor, event: any, id: any, ..._rest: any[]) => {
            const topic = eventTopicFor(modelConstr, event, id);
            if (!topic) return false;
            const withinModel = model ? topic === model || topic.startsWith(`${model}.`) : true;
            return withinModel && this.registry.matches(fingerprint, topic);
          }
        : undefined;

      try {
        for (const adapter of this.adapters) {
          adapter.observe(cb, filter as any);
        }
      } catch (e: any) {
        observer.error(`Failed to observe event: ${e.message || e}`);
      }

      return () => {
        try {
          for (const adapter of this.adapters) {
            adapter.unObserve(cb);
          }
        } catch (e: any) {
          logger.error(e);
        }
        this.registry.releaseConnection(fingerprint);
      };
    });
  }
}
