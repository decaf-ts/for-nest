import { DecafController } from "../controllers";
import { DecafRequestContext } from "../request";
import { Adapter, Observer } from "@decaf-ts/core";
import { Controller, Inject, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { Logging } from "@decaf-ts/logging";
import { LISTENING_ADAPTERS_FLAVOURS } from "./constant";
import { DecafServerCtx } from "../constants";
import { normalizeEventResponse } from "./utils";

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

    return new Observable<MessageEvent>((observer) => {
      const observerId = `B-${this.clientContext.uuid}`;

      logger.debug(`Creating SSE observer: ${observerId}`);
      const cb = new (class implements Observer {
        observerId = observerId;
        refresh(...args: any[]): Promise<void> {
          logger.debug(
            `SSE observer ${this.observerId} received refresh with ${args.length} arg(s)`
          );

          return Promise.resolve().then(() => {
            const data = normalizeEventResponse(args);
            observer.next({ data } as any);
            logger.debug(
              `SSE observer ${this.observerId} event pushed to client`
            );
          });
        }
      })();

      try {
        logger.debug(`Registering observer ${observerId} in adapters`);
        for (const adapter of this.adapters) {
          logger.debug(
            `Registering observer ${observerId} in adapter ${adapter?.constructor?.name ?? "UnknownAdapter"}`
          );
          adapter.observe(cb);
        }
      } catch (e: any) {
        logger.debug(
          `Failed to register observer ${observerId}: ${e?.message || e}`
        );
        observer.error(`Failed to observe event: ${e.message || e}`);
      }

      return () => {
        logger.debug(`Cleaning up SSE observer ${observerId}`);

        try {
          for (const adapter of this.adapters) {
            logger.debug(
              `Unregistering observer ${observerId} from adapter ${adapter?.constructor?.name ?? "UnknownAdapter"}`
            );
            adapter.unObserve(cb);
          }
        } catch (e: any) {
          logger.debug(
            `Failed during cleanup of observer ${observerId}: ${e?.message || e}`
          );
          logger.error(e);
        }
      };
    });
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
