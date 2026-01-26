import { DecafController } from "../controllers";
import { DecafServerContext } from "../constants";
import { DecafRequestContext } from "../request/index";
import { Adapter, Observer } from "@decaf-ts/core";
import { Controller, Inject, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { Logging } from "@decaf-ts/logging";
import { LISTENING_ADAPTERS_FLAVOURS } from "./constant";

@Controller()
export class EventsController extends DecafController<DecafServerContext> {
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
            args[0] = args[0]?.name || args[0];
            observer.next({ data: args } as any);
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
