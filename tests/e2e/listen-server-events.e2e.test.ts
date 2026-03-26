import { INestApplication, Module } from "@nestjs/common";
import { Adapter, Repo, repository, Repository } from "@decaf-ts/core";
import { ProcessStep } from "./fakes/models/ProcessStep";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
//  @ts-expect-error paths
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { EventSource } from "eventsource";
import { DecafStreamModule } from "../../src/events-module";
import { RamTransformer } from "../../src/ram";
import { Serialization } from "@decaf-ts/decorator-validation";

let serverUrl: string;

@repository(ProcessStep)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CustomRepository extends Repository<
  ProcessStep,
  Adapter<any, any, any, any>
> {
  constructor(adapter: Adapter<any, any, any, any>) {
    super(adapter, ProcessStep);
  }
}

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
class AppModule {
  constructor() {}
}

function listenForEvent(
  handler: () => void | Promise<void>,
  timeoutMs = 30000
): Promise<any> {
  const url = `${serverUrl}/events`;
  return new Promise((resolve, reject) => {
    const es = new EventSource(url);
    const timeout = setTimeout(() => {
      es.close();
      reject(new Error(`No SSE event received within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    es.onopen = async () => {
      try {
        await handler();
      } catch (e) {
        clearTimeout(timeout);
        es.close();
        reject(e);
      }
    };

    es.onmessage = (event) => {
      clearTimeout(timeout);
      es.close();
      resolve(JSON.parse(event.data));
    };

    es.onerror = (err) => {
      clearTimeout(timeout);
      es.close();
      reject(err);
    };
  });
}

function listenForMultipleEvents(
  handler: () => void | Promise<void>,
  condition: (events: any[]) => boolean,
  timeoutMs = 30_000
): Promise<any[]> {
  const url = `${serverUrl}/events`;
  return new Promise((resolve, reject) => {
    const es = new EventSource(url);
    const events = [];
    const timeout = setTimeout(() => {
      es.close();
      reject(new Error(`No SSE event received within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    es.onopen = async () => {
      try {
        await handler();
      } catch (e) {
        clearTimeout(timeout);
        es.close();
        reject(e);
      }
    };

    es.onmessage = (event) => {
      clearTimeout(timeout);
      es.close();
      events.push(JSON.parse(event.data));
      if (condition(events)) resolve(events);
    };

    es.onerror = (err) => {
      clearTimeout(timeout);
      es.close();
      reject(err);
    };
  });
}

const getId = () => Math.random().toString(36).slice(2);

jest.setTimeout(50000);

describe("Listen Server Events (e2e)", () => {
  let app: INestApplication;
  let repo: Repo<ProcessStep>;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.init();
    const server = await app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve server address");
    }
    serverUrl = `http://127.0.0.1:${address.port}`;
    repo = Repository.forModel(ProcessStep);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("Default Operations", () => {
    it("should receive CREATE event", async () => {
      const payload = new ProcessStep({
        id: `PS001`,
        currentStep: 1,
        totalSteps: 1,
        label: `Step ${1}`,
      });

      const event = await listenForEvent(async () => {
        await repo.create(payload);
      });

      expect(Array.isArray(event)).toEqual(true);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [tableName, operationKey, id, model, _] = event;
      expect(operationKey).toBe(OperationKeys.CREATE);
      expect(id).toBe(payload.id);
      expect(Serialization.deserialize(model)).toMatchObject(payload);
      expect(tableName).toEqual(payload.constructor.name);
    });

    it("should receive UPDATE event", async () => {
      const payload = new ProcessStep({
        id: `PS001`,
        currentStep: 2,
        totalSteps: 2,
        label: `Step ${2}`,
      });

      const event = await listenForEvent(async () => {
        await repo.update(payload);
      });

      expect(Array.isArray(event)).toEqual(true);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [tableName, operationKey, id, model, _] = event;
      expect(operationKey).toBe(OperationKeys.UPDATE);
      expect(id).toBe(payload.id);
      expect(Serialization.deserialize(model)).toMatchObject(payload);
      expect(tableName).toEqual(payload.constructor.name);
    });

    it("should receive DELETE event", async () => {
      const payload = new ProcessStep({
        id: `PS001`,
        currentStep: 2,
        totalSteps: 2,
        label: `Step ${2}`,
      });

      const event = await listenForEvent(async () => {
        await repo.delete(payload.id);
      });

      expect(Array.isArray(event)).toEqual(true);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [tableName, operationKey, id, model, _] = event;
      expect(operationKey).toBe(OperationKeys.DELETE);
      expect(id).toBe(payload.id);
      expect(Serialization.deserialize(model)).toMatchObject(payload);
      expect(tableName).toEqual(payload.constructor.name);
    });
  });

  it("should listen for bulk events", async () => {
    const payloads = [
      new ProcessStep({
        id: getId(),
        currentStep: 3,
        totalSteps: 3,
        label: `Step ${3}`,
      }),
      new ProcessStep({
        id: getId(),
        currentStep: 1,
        totalSteps: 5,
        label: `Step ${1}`,
      }),
    ];

    const events = await listenForMultipleEvents(
      async () => {
        await Promise.allSettled([
          repo.create(payloads[0]),
          repo.create(payloads[1]),
        ]);
      },
      (events: any[]) => events.length === 2
    );

    expect(Array.isArray(events)).toEqual(true);
    expect(events.length).toEqual(2);

    for (const event of events) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [tableName, operationKey, id, model, _] = event;
      const payload = payloads.find((p) => p.id === id);

      expect(operationKey).toBe(OperationKeys.CREATE);
      expect(id).toBe(payload.id);
      expect(Serialization.deserialize(model)).toMatchObject(payload);
      expect(tableName).toEqual(payload.constructor.name);
    }
  });

  it("should notify all parallel listeners for the same event", async () => {
    const payload = new ProcessStep({
      id: "Parallel_PS001",
      currentStep: 1,
      totalSteps: 1,
      label: "Step 1",
    });

    const delay = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    const startListener = () =>
      listenForEvent(async () => {
        console.log("Waiting for event...");
      });

    const createRecordAndListen = () =>
      listenForEvent(async () => {
        console.log("Creating record...");
        // Wait until all listeners are connected.
        await delay(5000);
        await repo.create(payload);
        console.log("Record created...");
      });

    const settledResults = await Promise.allSettled<Array<any>>([
      startListener(),
      startListener(),
      createRecordAndListen(),
    ]);

    const events = settledResults.map((result) => {
      expect(result.status).toBe("fulfilled");
      return result.status === "fulfilled" ? result.value : [];
    });

    expect(events).toHaveLength(3);

    events.forEach((event) => {
      expect(Array.isArray(event)).toBe(true);
      expect(event).toHaveLength(4);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [tableName, operationKey, id, model, _metadata] = event;

      expect(tableName).toBe(payload.constructor.name);
      expect(operationKey).toBe(OperationKeys.CREATE);
      expect(id).toBe(payload.id);
      expect(Serialization.deserialize(model)).toMatchObject(payload);
    });

    expect(events[0]).toEqual(events[1]);
    expect(events[1]).toEqual(events[2]);
  });
});
