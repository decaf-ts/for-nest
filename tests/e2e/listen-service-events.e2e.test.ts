import { INestApplication, Module } from "@nestjs/common";
import { EventIds, Observer, Repo, Repository } from "@decaf-ts/core";
import { ProcessStep } from "./fakes/models/ProcessStep";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
// @ts-expect-error paths
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { DecafStreamModule } from "../../src/events-module";
import { AxiosHttpAdapter, RestService } from "@decaf-ts/for-http";
import { RamTransformer } from "../../src/ram";
import { OperationKeys } from "@decaf-ts/db-decorators";

export type EventResponse = {
  model: string;
  event: OperationKeys;
  id: EventIds;
  observerId?: string;
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
class AppModule {
  constructor() {}
}

const getId = () => Math.random().toString(36).slice(2);

jest.setTimeout(180000);

describe("Listen Rest Service Events (e2e)", () => {
  let app: INestApplication;
  let repo: Repo<ProcessStep>;
  let httpAdapter: AxiosHttpAdapter;
  let restService: RestService<any, any, any>;

  function listenForEvent(
    handler: () => void | Promise<any>,
    timeoutMs = 20000
  ): Promise<EventResponse> {
    return new Promise((resolve, reject) => {
      let observer: Observer | undefined;

      const cleanup = () => {
        if (observer) {
          restService.unObserve(observer);
          observer = undefined;
        }
      };

      const timeout = setTimeout(() => {
        cleanup();
        response(
          new Error(`No SSE event received within ${timeoutMs / 1000}s`)
        );
      }, timeoutMs);

      const response = (error: any, response?: EventResponse): void => {
        clearTimeout(timeout);
        cleanup();
        return error ? reject(error) : resolve(response);
      };

      observer = new (class implements Observer {
        observerId = `test-${Math.random().toString(36).slice(2)}`;
        refresh(model: any, event: any, id: any, record: any): Promise<any> {
          console.log(
            `listenForEvent: event received from observer ${this.observerId}`,
            {
              model,
              event,
              id,
            }
          );

          response(undefined, {
            model,
            event,
            id,
            observerId: this.observerId,
          });
          return Promise.resolve();
        }
      })();

      try {
        restService.observe(observer);
      } catch (e: any) {
        response(e);
        return;
      }

      try {
        setTimeout(() => {
          console.log("listenForEvent: invoking handler");
          handler();
        }, 8000);
      } catch (e: any) {
        response(e);
      }
    });
  }

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
    repo = Repository.forModel(ProcessStep);

    // HttpAdapter
    httpAdapter = new AxiosHttpAdapter(
      {
        protocol: "http",
        host: serverUrl,
        eventsListenerPath: "events",
      },
      ProcessStep.name
    );
    await httpAdapter.initialize();
    restService = new RestService<any, any, any>(httpAdapter, ProcessStep);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("Default Operations", () => {
    const id = getId();

    it("should receive CREATE event", async () => {
      const payload = new ProcessStep({
        id: id,
        currentStep: 1,
        totalSteps: 1,
        label: `Step ${1}`,
      });

      const event = await listenForEvent(async () => {
        const r = await repo.create(payload);
        expect(r).toBeDefined();
      });

      expect(event).toMatchObject({
        model: ProcessStep.name,
        event: "create",
        id: payload.id,
      });
    });

    it("should receive UPDATE event", async () => {
      const payload = new ProcessStep({
        id: id,
        currentStep: 2,
        totalSteps: 2,
        label: `Step ${2}`,
      });

      const event = await listenForEvent(async () => {
        const r = await repo.update(payload);
        expect(r).toBeDefined();
      });

      expect(event).toMatchObject({
        model: ProcessStep.name,
        event: "update",
        id: payload.id,
      });
    });

    it("should receive DELETE event", async () => {
      const event = await listenForEvent(async () => {
        const r = await repo.delete(id);
        expect(r).toBeDefined();
      });

      expect(event).toMatchObject({
        model: ProcessStep.name,
        event: "delete",
        id: id,
      });
    });
  });

  it("should notify all parallel listeners for the same event", async () => {
    const payload = new ProcessStep({
      id: getId(),
      currentStep: 1,
      totalSteps: 1,
      label: "Step 1",
    });

    const waitForCreateEvent = () =>
      listenForEvent(async () => {
        console.log("Waiting for event...");
      });

    const triggerCreateEvent = () =>
      listenForEvent(async () => {
        console.log("Creating record...");
        // Wait until the first event listener is connected.
        new Promise((resolve) => setTimeout(resolve, 5000));
        await repo.create(payload);
        console.log("Record created...");
      });

    const results = await Promise.allSettled([
      waitForCreateEvent(),
      waitForCreateEvent(),
      triggerCreateEvent(),
    ]);

    const fulfilledResults = results
      .filter((result) => result.status === "fulfilled")
      .map((result: any) => result.value);

    expect(fulfilledResults).toHaveLength(3);
    fulfilledResults.forEach((eventResult) => {
      expect(eventResult).toMatchObject({
        model: ProcessStep.name,
        event: OperationKeys.CREATE,
        id: payload.id,
        observerId: expect.any(String),
      });
    });

    // check different observers
    const observerIds = fulfilledResults.map(({ observerId }) => observerId);
    expect(new Set(observerIds).size).toBe(3);
  });
});
