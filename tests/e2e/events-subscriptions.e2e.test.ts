import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  Adapter,
  Repository,
  Repo,
} from "@decaf-ts/core";
// @ts-expect-error ram
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { DecafModule } from "../../src";
import { DecafExceptionFilter } from "../../src/factory/exceptions";
import { ProcessStep } from "./fakes/models/ProcessStep";
import { Fake } from "./fakes/models/Fake";
import { AxiosHttpAdapter, RestService } from "@decaf-ts/for-http";
import { RamTransformer } from "@decaf-ts/for-http/server";
import { InternalError } from "@decaf-ts/db-decorators";
import { EventSource } from "eventsource";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
jest.setTimeout(30000);

type Consumer = {
  adapter: AxiosHttpAdapter;
  service: RestService<any, any, any>;
  events: any[][];
  stop: () => void;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 15000,
  stepMs = 25
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return;
    await delay(stepMs);
  }
  throw new InternalError("Timed out waiting for event condition");
}

async function waitForListening(consumers: Consumer[]): Promise<void> {
  await waitFor(() =>
    consumers.every((consumer) => Boolean((consumer.adapter as any).dispatch?.listening))
  );
}

function makeConsumer<T>(
  adapter: AxiosHttpAdapter,
  model: new (...args: any[]) => T
): Consumer {
  const service = new RestService(adapter, model as any);
  const events: any[][] = [];
  const stop = service.observe({
    refresh: async (...args: any[]) => {
      events.push(args);
    },
  } as any);

  return { adapter, service, events, stop };
}

async function createBackend(subscriptionMode: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      await DecafModule.forRootAsync({
        conf: [[RamAdapter, {}, new RamTransformer()]],
        autoControllers: true,
        autoServices: false,
        observerOptions: {
          enableObserverEvents: true,
          subscriptionMode,
        },
      } as any),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new DecafExceptionFilter());
  await app.init();
  await app.listen(0, "127.0.0.1");
  return app;
}

describe("Events SSE observables fan-out", () => {
  let app: INestApplication;
  let serverHost: string;

  afterEach(async () => {
    try {
      await app?.close();
    } catch {
      // ignore cleanup failures in the fan-out regression tests
    }
  });

  it("broadcasts each event exactly once to 5+ HTTP adapters in default mode", async () => {
    app = await createBackend(false);
    const server = app.getHttpServer().address();
    if (!server || typeof server === "string") {
      throw new InternalError("Failed to resolve server address");
    }
    serverHost = `127.0.0.1:${server.port}`;

    const consumers = Array.from({ length: 5 }).map((_, idx) => {
      const adapter = new AxiosHttpAdapter(
        {
          protocol: "http",
          host: serverHost,
          eventsListenerPath: "events",
        },
        `broadcast-${idx}`
      );
      return makeConsumer(adapter, ProcessStep);
    });

    const subscribeResponse = await fetch(
      `http://${serverHost}/events/subscribe`,
      { method: "POST" }
    );
    const unsubscribeResponse = await fetch(
      `http://${serverHost}/events/unsubscribe`,
      { method: "POST" }
    );
    expect([404, 406]).toContain(subscribeResponse.status);
    expect([404, 406]).toContain(unsubscribeResponse.status);

    await waitForListening(consumers);

    const repo = Repository.forModel(ProcessStep);
    const record = new ProcessStep({
      id: `broadcast-${Math.random().toString(36).slice(2)}`,
      currentStep: 1,
      totalSteps: 1,
      label: "broadcast",
    });
    await repo.create(record);

    await waitFor(() => consumers.every((consumer) => consumer.events.length === 1));
    consumers.forEach((consumer) => {
      expect(consumer.events).toHaveLength(1);
      expect(consumer.events[0][0]).toBe(ProcessStep.name);
      expect(consumer.events[0][1]).toBe("create");
      expect(consumer.events[0][2]).toBe(record.id);
    });

    consumers.forEach((consumer) => consumer.stop());
    await Promise.all(
      consumers.map(async (consumer) => {
        try {
          await consumer.adapter.shutdown();
        } catch {
          // ignore cleanup failures
        }
      })
    );
  });

  it("subscribes each HTTP adapter to only its requested events in private mode", async () => {
    app = await createBackend(true);
    const server = app.getHttpServer().address();
    if (!server || typeof server === "string") {
      throw new InternalError("Failed to resolve server address");
    }
    serverHost = `127.0.0.1:${server.port}`;

    const processConsumers = Array.from({ length: 3 }).map((_, idx) => {
      const adapter = new AxiosHttpAdapter(
        {
          protocol: "http",
          host: serverHost,
          eventsListenerPath: "events",
          eventsSubscription: true,
        },
        `process-${idx}`
      );
      return makeConsumer(adapter, ProcessStep);
    });

    const fakeConsumers = Array.from({ length: 3 }).map((_, idx) => {
      const adapter = new AxiosHttpAdapter(
        {
          protocol: "http",
          host: serverHost,
          eventsListenerPath: "events",
          eventsSubscription: true,
        },
        `fake-${idx}`
      );
      return makeConsumer(adapter, Fake);
    });

    const allConsumers = [...processConsumers, ...fakeConsumers];
    await waitForListening(allConsumers);

    const subscribeResponse = await fetch(`http://${serverHost}/events/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriberId: "manual-subscribe",
        topics: [ProcessStep.name],
      }),
    });
    expect(subscribeResponse.status).toBe(201);

    const processRepo: Repo<ProcessStep> = Repository.forModel(ProcessStep);
    const fakeRepo: Repo<Fake> = Repository.forModel(Fake);

    const processRecord = new ProcessStep({
      id: `process-${Math.random().toString(36).slice(2)}`,
      currentStep: 1,
      totalSteps: 1,
      label: "process",
    });
    const fakeRecord = new Fake({
      id: `fake-${Math.random().toString(36).slice(2)}`,
      name: "fake",
    });

    await processRepo.create(processRecord);
    await waitFor(() =>
      processConsumers.every((consumer) => consumer.events.length === 1) &&
      fakeConsumers.every((consumer) => consumer.events.length === 0)
    );

    await fakeRepo.create(fakeRecord);
    await waitFor(() =>
      processConsumers.every((consumer) => consumer.events.length === 1) &&
      fakeConsumers.every((consumer) => consumer.events.length === 1)
    );

    processConsumers.forEach((consumer) => {
      expect(consumer.events).toHaveLength(1);
      expect(consumer.events[0][0]).toBe(ProcessStep.name);
      expect(consumer.events[0][1]).toBe("create");
      expect(consumer.events[0][2]).toBe(processRecord.id);
    });
    fakeConsumers.forEach((consumer) => {
      expect(consumer.events).toHaveLength(1);
      expect(consumer.events[0][0]).toBe(Fake.name);
      expect(consumer.events[0][1]).toBe("create");
      expect(consumer.events[0][2]).toBe(fakeRecord.id);
    });

    processConsumers[0].stop();
    await waitFor(
      () => !(processConsumers[0].adapter as any).dispatch?.listening
    );

    const secondProcessRecord = new ProcessStep({
      id: `process-${Math.random().toString(36).slice(2)}`,
      currentStep: 2,
      totalSteps: 2,
      label: "process-2",
    });
    await processRepo.create(secondProcessRecord);

    await waitFor(() =>
      processConsumers.slice(1).every((consumer) => consumer.events.length === 2) &&
      fakeConsumers.every((consumer) => consumer.events.length === 1)
    );

    expect(processConsumers[0].events).toHaveLength(1);
    processConsumers.slice(1).forEach((consumer) => {
      expect(consumer.events).toHaveLength(2);
      expect(consumer.events[1][0]).toBe(ProcessStep.name);
      expect(consumer.events[1][2]).toBe(secondProcessRecord.id);
    });

    [...processConsumers.slice(1), ...fakeConsumers].forEach((consumer) =>
      consumer.stop()
    );
    await Promise.all(
      allConsumers.map(async (consumer) => {
        try {
          await consumer.adapter.shutdown();
        } catch {
          // ignore cleanup failures
        }
      })
    );
  });

  it("does not deliver private-mode events when an HttpAdapter never subscribes", async () => {
    app = await createBackend(true);
    const server = app.getHttpServer().address();
    if (!server || typeof server === "string") {
      throw new InternalError("Failed to resolve server address");
    }
    serverHost = `127.0.0.1:${server.port}`;

    const subscriberId = `raw-${Math.random().toString(36).slice(2)}`;
    const source = new EventSource(
      `http://${serverHost}/events?subscriberId=${subscriberId}`
    );
    const rawEvents: any[] = [];
    source.onmessage = (event) => {
      rawEvents.push(event.data);
    };

    const noSubscribeRecord = new ProcessStep({
      id: `no-subscribe-${Math.random().toString(36).slice(2)}`,
      currentStep: 1,
      totalSteps: 1,
      label: "no-subscribe",
    });
    await Repository.forModel(ProcessStep).create(noSubscribeRecord);
    await delay(1000);

    expect(rawEvents).toHaveLength(0);
    source.close();
  });
});
