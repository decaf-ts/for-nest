import { INestApplication, Module } from "@nestjs/common";
import { EventIds, Observer, Repo, Repository } from "@decaf-ts/core";
import { NestFactory } from "@nestjs/core";
import {
  DecafExceptionFilter,
  DecafModule,
  DecafStreamModule,
} from "../../src";
// @ts-expect-error paths
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { AxiosHttpAdapter, RestService } from "@decaf-ts/for-http";
import { RamTransformer } from "../../src/ram";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Fake } from "./fakes/models/Fake";

export type EventResponse = {
  model: string;
  event: OperationKeys;
  id: EventIds;
  observerId: string;
  receivedAt: number;
};

type EmittedEvent = {
  id: string;
  createdAt: number;
};

@Module({
  imports: [
    DecafModule.forRootAsync({
      conf: [[RamAdapter, {}, new RamTransformer()]],
      autoControllers: true,
      autoServices: false,
    } as any),
    DecafStreamModule.forFlavours([RamFlavour], "/events"),
  ],
})
class AppModule {}

jest.setTimeout(180000);

describe("Listen Rest Service Events Propagation to Multiple Observers (e2e)", () => {
  let app: INestApplication;
  let repo: Repo<Fake>;
  let httpAdapter: AxiosHttpAdapter;
  let restService: RestService<any, any, any>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.init();

    const server = await app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve server address");
    }

    const serverUrl = new URL(`http://127.0.0.1:${address.port}`).host;
    repo = Repository.forModel(Fake);
    httpAdapter = new AxiosHttpAdapter(
      {
        protocol: "http",
        host: serverUrl,
        eventsListenerPath: "events",
      },
      Fake.name
    );

    await httpAdapter.initialize();
    restService = new RestService<any, any, any>(httpAdapter, Fake);
  });

  afterAll(async () => {
    await app?.close();
  });

  function createTestObserver(
    observerId: string,
    receivedEvents: EventResponse[]
  ): Observer {
    return new (class implements Observer {
      observerId = observerId;
      async refresh(model: any, event: any, id: any): Promise<void> {
        receivedEvents.push({
          model,
          event,
          id,
          observerId: this.observerId,
          receivedAt: Date.now(),
        });
      }
    })();
  }

  function startCreateLoop(params: {
    repo: Repo<Fake>;
    everyMs: number;
    maxCreates: number;
    emittedEvents: EmittedEvent[];
  }) {
    const { repo, everyMs, maxCreates, emittedEvents } = params;

    let intervalHandle: any;
    let created = 0;
    let stopped = false;

    const done = new Promise<void>((resolve, reject) => {
      intervalHandle = setInterval(async () => {
        if (stopped) return;

        if (created >= maxCreates) {
          if (intervalHandle) clearInterval(intervalHandle);
          resolve();
          return;
        }

        try {
          created += 1;

          const id = `${Date.now()}-${created}`;
          const payload = new Fake({
            id,
            name: `fake-${created}`,
          });

          const result = await repo.create(payload);
          emittedEvents.push({
            id,
            createdAt: Date.now(),
            response: result,
          });
          expect(result).toBeDefined();
        } catch (error) {
          if (intervalHandle) clearInterval(intervalHandle);
          reject(error);
        }
      }, everyMs);
    });

    return {
      done,
      stop: () => {
        stopped = true;
        if (intervalHandle) clearInterval(intervalHandle);
      },
    };
  }

  function startObserverLoop(params: {
    restService: RestService<any, any, any>;
    everyMs: number;
    totalObservers: number;
    receivedEvents: EventResponse[];
    observers: Map<string, Observer>;
    observerRegisteredAt: Map<string, number>;
  }) {
    const {
      restService,
      everyMs,
      totalObservers,
      receivedEvents,
      observers,
      observerRegisteredAt,
    } = params;

    let intervalHandle: any;
    let created = 0;
    let stopped = false;

    const addObserver = () => {
      created += 1;
      const observerId = `observer-${created}`;
      const observer = createTestObserver(observerId, receivedEvents);
      observers.set(observerId, observer);
      observerRegisteredAt.set(observerId, Date.now());
      restService.observe(observer);
    };

    const done = new Promise<void>((resolve, reject) => {
      try {
        // add first one
        if (created === 0) {
          addObserver();
        }

        intervalHandle = setInterval(() => {
          if (stopped) return;

          if (created >= totalObservers) {
            if (intervalHandle) clearInterval(intervalHandle);
            resolve();
            return;
          }

          try {
            addObserver();
          } catch (error) {
            if (intervalHandle) clearInterval(intervalHandle);
            reject(error);
          }
        }, everyMs);
      } catch (error) {
        reject(error);
      }
    });

    return {
      done,
      stop: () => {
        stopped = true;
        if (intervalHandle) clearInterval(intervalHandle);
      },
      unobserveAll: () => {
        for (const observer of observers.values()) {
          restService.unObserve(observer);
        }
        observers.clear();
      },
    };
  }

  function assertNoDuplicateEventPerObserver(events: EventResponse[]) {
    const grouped = new Map<string, number>();
    for (const evt of events) {
      const key = `${evt.observerId}::${evt.id}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }

    const duplicates = [...grouped.entries()].filter(([, count]) => count > 1);
    expect(duplicates).toEqual([]);
  }

  function assertFanOutMatchesActiveObservers(params: {
    emittedEvents: EmittedEvent[];
    receivedEvents: EventResponse[];
    observerRegisteredAt: Map<string, number>;
  }) {
    const { emittedEvents, receivedEvents, observerRegisteredAt } = params;
    for (const emitted of emittedEvents) {
      const expectedObserverIds = [...observerRegisteredAt.entries()]
        .filter(([, registeredAt]) => registeredAt <= emitted.createdAt)
        .map(([observerId]) => observerId)
        .sort();

      const deliveries = receivedEvents.filter((evt) => evt.id === emitted.id);
      const actualObserverIds = [
        ...new Set(deliveries.map((evt) => evt.observerId)),
      ].sort();

      // each event must be delivered exactly once per observer
      expect(deliveries).toHaveLength(actualObserverIds.length);

      // and to all observers active at the time the event was emitted
      expect(actualObserverIds).toEqual(expectedObserverIds);
    }
  }

  it("should listen event without duplicating events per observer", async () => {
    const totalObservers = 10;
    const maxEventsToCreate = 50;
    const iterationIntervalMs = 500;
    const receivedEvents: EventResponse[] = [];
    const emittedEvents: EmittedEvent[] = [];
    const observers = new Map<string, Observer>();
    const observerRegisteredAt = new Map<string, number>();

    expect(iterationIntervalMs).toBeGreaterThan(0);
    expect(totalObservers).toBeLessThan(maxEventsToCreate);

    const createLoop = startCreateLoop({
      repo,
      everyMs: iterationIntervalMs,
      maxCreates: maxEventsToCreate,
      emittedEvents,
    });

    const observerLoop = startObserverLoop({
      restService,
      everyMs: iterationIntervalMs * 1.5,
      totalObservers,
      receivedEvents,
      observers,
      observerRegisteredAt,
    });

    try {
      await Promise.all([createLoop.done, observerLoop.done]);

      expect(emittedEvents.length).toBeGreaterThan(0);
      expect(emittedEvents.length).toBe(maxEventsToCreate);
      expect(observerRegisteredAt.size).toBe(totalObservers);
      expect(receivedEvents.length).toBeGreaterThan(maxEventsToCreate);
      for (const evt of receivedEvents) {
        expect(evt).toBeDefined();
        expect(evt.id).toBeDefined();
        expect(evt.event).toBeDefined();
        expect(evt.observerId).toBeDefined();
      }

      // the same observer must not receive the same id more than once
      assertNoDuplicateEventPerObserver(receivedEvents);

      // each event must be delivered exactly once to every observer active at that moment
      assertFanOutMatchesActiveObservers({
        emittedEvents,
        receivedEvents,
        observerRegisteredAt,
      });
    } finally {
      createLoop.stop();
      observerLoop.stop();
      observerLoop.unobserveAll();
    }
  });
});
