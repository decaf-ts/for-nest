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
      const cb = new (class implements Observer {
        refresh(...args: any[]): Promise<void> {
          return Promise.resolve().then(() => {
            const data = normalizeEventResponse(args);
            observer.next({ data } as any);
          });
        }
      })();

      // if (!events || events.length === 0)
      //   return observer.error({
      //     message: `${NotFoundError.name} - No events available to listen for role: ${type}.`,
      //   });

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
