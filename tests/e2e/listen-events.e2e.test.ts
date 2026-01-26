import { INestApplication, Module } from "@nestjs/common";
import {
  Context,
  Observer,
  RamFlavour,
  Repo,
  Repository,
} from "@decaf-ts/core";
import { ProcessStep } from "./fakes/models/ProcessStep";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
import { RamAdapter } from "@decaf-ts/core/ram";
import { DecafStreamModule } from "../../src/events-module";
import { AxiosHttpAdapter, RestService } from "@decaf-ts/for-http";
import { Logging } from "@decaf-ts/logging";
import { RamTransformer } from "../../src/ram";

const PORT = 3000;
const serverUrl = `127.0.0.1:${PORT}`;

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

describe("Listen for /events (e2e)", () => {
  let app: INestApplication;
  let repo: Repo<ProcessStep>;
  let httpAdapter: AxiosHttpAdapter;
  let restService: RestService<any, any, any>;
  let _observer: Observer;
  const id = getId();

  const ctx = new Context().accumulate({
    logger: Logging.for(expect.getState().currentTestName),
  });

  function listenForEvent(
    handler: () => void | Promise<any>,
    timeoutMs = 80000
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        restService.unObserve(_observer);
        reject(new Error(`No SSE event received within ${timeoutMs / 1000}s`));
      }, timeoutMs);

      const response = (error: any, response?: any): void => {
        clearTimeout(timeout);
        restService.unObserve(_observer);
        return error ? reject(error) : resolve(response);
      };

      _observer = new (class implements Observer {
        refresh(model, event, id): Promise<any> {
          response(undefined, { model, event, id });
          return Promise.resolve();
        }
      })();

      try {
        restService.observe(_observer);
        // wait to event listener to establish connection
        setTimeout(() => {
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
    await app.listen(PORT);

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

  it.skip("should receive CREATE event", async () => {
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

  it.skip("should receive UPDATE event", async () => {
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

  it.skip("should receive DELETE event", async () => {
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
