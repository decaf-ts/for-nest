import { DecafController } from "../controllers";
import { DecafRequestContext } from "../request";
import { Adapter, Observer } from "@decaf-ts/core";
import { Controller, Inject, MessageEvent, Query, Sse } from "@nestjs/common";
import { interval, merge, Observable } from "rxjs";
import { Logging } from "@decaf-ts/logging";
import { LISTENING_ADAPTERS_FLAVOURS } from "./constant";
import { DecafServerCtx } from "../constants";
import { normalizeEventResponse } from "./utils";
import { map, tap } from "rxjs/operators";

@Controller()
export class EventsController extends DecafController<DecafServerCtx> {
  private readonly adapters: Adapter<any, any, any, any>[];

  constructor(
    clientContext: DecafRequestContext,
    @Inject(LISTENING_ADAPTERS_FLAVOURS) flavours: string[]
  ) {
    super(clientContext, EventsController.name);
    this.adapters = flavours.map((flavour) => (Adapter as any).get(flavour)); // change to Adapter.cache("")
  }

  @Sse()
  listen(): Observable<MessageEvent> {
    const logger = Logging.for(EventsController.name);

    const events$ = new Observable<MessageEvent>((observer) => {
      const observerId =
        `B-${Math.random().toString(36).slice(2, 8)}`.toUpperCase();

      logger.info(
        `Creating SSE observer: ${observerId} for client ${this.clientContext.uuid}`
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

      logger.verbose(
        `Registering observer ${observerId} across ${this.adapters.length} adapter(s)`
      );
      for (const adapter of this.adapters) {
        const adapterName = adapter?.constructor?.name ?? "UnknownAdapter";
        try {
          logger.debug(
            `Registering observer ${observerId} in adapter ${adapterName}`
          );
          adapter.observe(cb);
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

  @Sse("/:model")
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  listenForModel(@Query("model") model: string): Observable<MessageEvent> {
    const logger = Logging.for(EventsController.name);

    return new Observable<MessageEvent>((observer) => {
      const cb = new (class implements Observer {
        refresh(...args: any[]): Promise<void> {
          return Promise.resolve().then(() => {
            observer.next({ data: args } as any);
          });
        }
      })();

      try {
        for (const adapter of this.adapters) {
          adapter.observe(cb);
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
      };
    });
  }
}
