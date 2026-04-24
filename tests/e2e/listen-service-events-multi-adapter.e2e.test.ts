import { INestApplication, Module } from "@nestjs/common";
import { Adapter, Repo, Repository, Observer, EventIds } from "@decaf-ts/core";
import { ProcessStep } from "./fakes/models/ProcessStep";
import { Fake } from "./fakes/models/Fake";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
// @ts-expect-error paths
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { DecafStreamModule } from "../../src/events-module";
import { AxiosHttpAdapter, RestService } from "@decaf-ts/for-http";
import { RamTransformer } from "../../src/ram";
import { OperationKeys } from "@decaf-ts/db-decorators";

type ReceivedEvent = {
  model: string;
  operation: string;
  id: EventIds;
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

function waitForEvents(
  service: RestService<any, any, any>,
  expectedCount: number,
  timeoutMs = 30000
): Promise<ReceivedEvent[]> {
  return new Promise((resolve, reject) => {
    const events: ReceivedEvent[] = [];

    const observer = new (class implements Observer {
      refresh(model: any, operation: string, id: EventIds): Promise<void> {
        events.push({
          model: model?.name ?? String(model),
          operation,
          id,
        });

        if (events.length === expectedCount) {
          clearTimeout(timeout);
          try {
            service.unObserve(this);
          } catch {
            // ignore cleanup errors in test helper
          }
          resolve(events);
        }

        return Promise.resolve();
      }
    })();

    const timeout = setTimeout(() => {
      try {
        service.unObserve(observer);
      } catch {
        // ignore cleanup errors in test helper
      }
      reject(
        new Error(
          `Timed out waiting for ${expectedCount} events, got ${events.length}`
        )
      );
    }, timeoutMs);

    try {
      service.observe(observer);
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
}

async function waitForServerObserverCount(
  adapter: any,
  expectedCount: number,
  timeoutMs = 10000
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const count = adapter?.observerHandler?.count?.() ?? 0;
    if (count >= expectedCount) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const count = adapter?.observerHandler?.count?.() ?? 0;
  throw new Error(
    `Timed out waiting for ${expectedCount} server observers, got ${count}`
  );
}

jest.setTimeout(180000);

describe("Listen Service Events with multiple adapters/models (e2e)", () => {
  let app: INestApplication;
  let serverHost: string;
  let processRepo: Repo<ProcessStep>;
  let fakeRepo: Repo<Fake>;
  let backendProcessRepo: Repo<ProcessStep>;
  let backendFakeRepo: Repo<Fake>;
  const backendProcessEvents: ReceivedEvent[] = [];
  const backendFakeEvents: ReceivedEvent[] = [];
  let unobserveBackendProcess: (() => void) | undefined;
  let unobserveBackendFake: (() => void) | undefined;

  let adapterA: AxiosHttpAdapter;
  let adapterB: AxiosHttpAdapter;
  let processSvcA: RestService<ProcessStep, any, any>;
  let fakeSvcA: RestService<Fake, any, any>;
  let processSvcB: RestService<ProcessStep, any, any>;
  let fakeSvcB: RestService<Fake, any, any>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.init();

    const server = await app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve server address");
    }

    serverHost = `127.0.0.1:${address.port}`;
    processRepo = Repository.forModel(ProcessStep);
    fakeRepo = Repository.forModel(Fake);
    backendProcessRepo = processRepo
      .for({ requestId: "backend-process" } as any)
      .override({ forcePrepareSimpleQueries: true } as any);
    backendFakeRepo = fakeRepo
      .for({ requestId: "backend-fake" } as any)
      .override({ forcePrepareSimpleQueries: true } as any);

    adapterA = new AxiosHttpAdapter(
      {
        protocol: "http",
        host: serverHost,
        eventsListenerPath: "events",
      },
      "http-a"
    );
    adapterB = new AxiosHttpAdapter(
      {
        protocol: "http",
        host: serverHost,
        eventsListenerPath: "events",
      },
      "http-b"
    );

    await adapterA.initialize();
    await adapterB.initialize();

    processSvcA = new RestService(adapterA, ProcessStep)
      .for({ headers: { "x-proxy-repo": "process-a" } } as any)
      .override({ forcePrepareSimpleQueries: true }) as any;
    fakeSvcA = new RestService(adapterA, Fake)
      .for({ headers: { "x-proxy-repo": "fake-a" } } as any)
      .override({ forcePrepareSimpleQueries: true }) as any;
    processSvcB = new RestService(adapterB, ProcessStep)
      .for({ headers: { "x-proxy-repo": "process-b" } } as any)
      .override({ forcePrepareSimpleQueries: true }) as any;
    fakeSvcB = new RestService(adapterB, Fake)
      .for({ headers: { "x-proxy-repo": "fake-b" } } as any)
      .override({ forcePrepareSimpleQueries: true }) as any;

    unobserveBackendProcess = backendProcessRepo.observe({
      refresh(model: any, operation: string, id: EventIds): Promise<void> {
        backendProcessEvents.push({
          model: model?.name ?? String(model),
          operation,
          id,
        });
        return Promise.resolve();
      },
    });
    unobserveBackendFake = backendFakeRepo.observe({
      refresh(model: any, operation: string, id: EventIds): Promise<void> {
        backendFakeEvents.push({
          model: model?.name ?? String(model),
          operation,
          id,
        });
        return Promise.resolve();
      },
    });
  });

  afterAll(async () => {
    try {
      unobserveBackendProcess?.();
    } catch {
      // ignore cleanup errors
    }
    try {
      unobserveBackendFake?.();
    } catch {
      // ignore cleanup errors
    }
    try {
      await adapterA?.shutdown();
    } catch {
      // ignore cleanup errors
    }
    try {
      await adapterB?.shutdown();
    } catch {
      // ignore cleanup errors
    }
    await app?.close();
  });

  it("delivers each event once, in order, for each model, across multiple connected HttpAdapters", async () => {
    const processIds = [
      `ps_${Math.random().toString(36).slice(2)}`,
      `ps_${Math.random().toString(36).slice(2)}`,
      `ps_${Math.random().toString(36).slice(2)}`,
    ];
    const fakeIds = [
      `fk_${Math.random().toString(36).slice(2)}`,
      `fk_${Math.random().toString(36).slice(2)}`,
      `fk_${Math.random().toString(36).slice(2)}`,
    ];

    const expectedPerModel = 3;

    const ramAdapter = (Adapter as any).get(RamFlavour);
    const baseServerObservers = ramAdapter?.observerHandler?.count?.() ?? 0;

    const pA = waitForEvents(processSvcA, expectedPerModel);
    const fA = waitForEvents(fakeSvcA, expectedPerModel);
    const pB = waitForEvents(processSvcB, expectedPerModel);
    const fB = waitForEvents(fakeSvcB, expectedPerModel);

    await waitForServerObserverCount(ramAdapter, baseServerObservers + 1);

    backendProcessEvents.length = 0;
    backendFakeEvents.length = 0;

    for (let i = 0; i < expectedPerModel; i++) {
      await backendProcessRepo.create(
        new ProcessStep({
          id: processIds[i],
          currentStep: i + 1,
          totalSteps: expectedPerModel,
          label: `step-${i + 1}`,
        })
      );

      await backendFakeRepo.create(
        new Fake({
          id: fakeIds[i],
          name: `fake-${i + 1}`,
        })
      );
    }

    const [processEventsA, fakeEventsA, processEventsB, fakeEventsB] =
      await Promise.all([pA, fA, pB, fB]);

    const assertProcess = (events: ReceivedEvent[]) => {
      expect(events).toHaveLength(expectedPerModel);
      expect(events.map((e) => e.operation)).toEqual([
        OperationKeys.CREATE,
        OperationKeys.CREATE,
        OperationKeys.CREATE,
      ]);
      expect(events.map((e) => e.model)).toEqual([
        ProcessStep.name,
        ProcessStep.name,
        ProcessStep.name,
      ]);
      expect(events.map((e) => String(e.id))).toEqual(processIds);
      expect(new Set(events.map((e) => String(e.id))).size).toBe(expectedPerModel);
    };

    const assertFake = (events: ReceivedEvent[]) => {
      expect(events).toHaveLength(expectedPerModel);
      expect(events.map((e) => e.operation)).toEqual([
        OperationKeys.CREATE,
        OperationKeys.CREATE,
        OperationKeys.CREATE,
      ]);
      expect(events.map((e) => e.model)).toEqual([
        Fake.name,
        Fake.name,
        Fake.name,
      ]);
      expect(events.map((e) => String(e.id))).toEqual(fakeIds);
      expect(new Set(events.map((e) => String(e.id))).size).toBe(expectedPerModel);
    };

    assertProcess(processEventsA);
    assertProcess(processEventsB);
    assertFake(fakeEventsA);
    assertFake(fakeEventsB);
    assertProcess(backendProcessEvents);
    assertFake(backendFakeEvents);
  });

});
