import {
  Adapter,
  Repository as CoreRepository,
  Service as CoreService,
  pk,
  repository,
  service,
  table,
} from "@decaf-ts/core";
// @ts-expect-error ram
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { INestApplication, Controller, Get } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Model, ModelArg, model } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import { Logging, MiniLogger } from "@decaf-ts/logging";
import request from "supertest";
import { RamTransformer } from "@decaf-ts/for-http/server";
import { DecafModule } from "../../src";
import { DecafRequestContext } from "../../src/request/DecafRequestContext";
import { DecafController } from "../../src/controllers";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

function loggerContextSummary(logger: unknown): string {
  const context = (logger as any)?.context;
  if (!Array.isArray(context)) return String(context ?? "");
  return context
    .map((value) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const name = (value as any).name || (value as any).constructor?.name;
        if (name) return String(name);
      }
      return String(value);
    })
    .join(" > ");
}

function requestLoggerOf(ctx: DecafRequestContext): MiniLogger | undefined {
  return (ctx.getOrUndefined("logger" as any) ?? (ctx as any).logger) as
    | MiniLogger
    | undefined;
}

@uses(RamFlavour)
@table("request_logger_probe")
@model()
class RequestLoggerProbeModel extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  constructor(arg?: ModelArg<RequestLoggerProbeModel>) {
    super(arg);
  }
}

@repository(RequestLoggerProbeModel)
class RequestLoggerProbeRepository extends CoreRepository<
  RequestLoggerProbeModel,
  any
> {
  constructor() {
    super(new RamAdapter(), RequestLoggerProbeModel);
  }

  capture(ctx: DecafRequestContext) {
    const baseLogger = requestLoggerOf(ctx);
    const log = (baseLogger ?? Logging.get()).for(this.capture);
    log.debug("repository logger probe");
    return {
      baseLogger,
      baseLoggerSummary: loggerContextSummary(baseLogger),
      logSummary: loggerContextSummary(log),
    };
  }
}

@service()
class RequestLoggerProbeService extends CoreService {
  private readonly repo = new RequestLoggerProbeRepository();

  capture(ctx: DecafRequestContext) {
    const { ctx: activeCtx, log } = this.logCtx([ctx], this.capture);
    log.debug("service logger probe");
    const repoResult = this.repo.capture(activeCtx);
    const baseLogger = requestLoggerOf(activeCtx);
    return {
      baseLogger,
      baseLoggerSummary: loggerContextSummary(baseLogger),
      logSummary: loggerContextSummary(log),
      repoResult,
    };
  }
}

@Controller("request-logger-probe")
class RequestLoggerProbeController extends DecafController {
  constructor(clientContext: DecafRequestContext, private readonly service: RequestLoggerProbeService) {
    super(clientContext, "RequestLoggerProbeController");
  }

  @Get()
  trace() {
    const { ctx: activeCtx, log } = this.logCtx([this.clientContext], "trace");
    log.debug("controller logger probe");
    const serviceResult = this.service.capture(activeCtx);
    const baseLogger = requestLoggerOf(activeCtx);
    const requestLogger = requestLoggerOf(this.clientContext);

    return {
      requestLoggerSummary: loggerContextSummary(requestLogger),
      controllerBaseLoggerSummary: loggerContextSummary(baseLogger),
      controllerLogSummary: loggerContextSummary(log),
      controllerBaseLoggerIsRequestLogger: baseLogger === requestLogger,
      serviceBaseLoggerSummary: serviceResult.baseLoggerSummary,
      serviceLogSummary: serviceResult.logSummary,
      serviceBaseLoggerIsRequestLogger:
        serviceResult.baseLogger === requestLogger,
      repoBaseLoggerSummary: serviceResult.repoResult.baseLoggerSummary,
      repoLogSummary: serviceResult.repoResult.logSummary,
      repoBaseLoggerIsRequestLogger:
        serviceResult.repoResult.baseLogger === requestLogger,
    };
  }
}

describe("request logger propagation (e2e)", () => {
  let app: INestApplication;
  let HttpRequest: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        await DecafModule.forRootAsync({
          conf: [[RamAdapter, {}, new RamTransformer()]],
          autoControllers: false,
          autoServices: false,
        } as any),
      ],
      controllers: [RequestLoggerProbeController],
      providers: [RequestLoggerProbeService],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, "127.0.0.1");
    HttpRequest = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps the request logger bound from the interceptor through controller, service, and repository", async () => {
    const getSpy = jest.spyOn(Logging, "get");
    const forSpy = jest.spyOn(MiniLogger.prototype, "for");
    const debugSpy = jest
      .spyOn(MiniLogger.prototype, "debug")
      .mockImplementation(() => undefined);

    try {
      const res = await HttpRequest.get("/request-logger-probe").set({
        "x-forwarded-for": "203.0.113.77",
      });
      const result = res.body;

      const contextualizeCall = forSpy.mock.calls.find(
        ([arg]) => arg && typeof arg === "object" && "ip" in (arg as object)
      );
      expect(contextualizeCall).toBeDefined();
      expect(res.status).toBe(200);
      expect(result.controllerBaseLoggerIsRequestLogger).toBe(true);
      expect(result.serviceBaseLoggerIsRequestLogger).toBe(true);
      expect(result.repoBaseLoggerIsRequestLogger).toBe(true);
      expect(result.controllerLogSummary).toContain(
        "RequestLoggerProbeController"
      );
      expect(result.serviceLogSummary).toContain("RequestLoggerProbeService");
      expect(result.repoLogSummary).toContain("capture");
      expect(getSpy).toHaveBeenCalledTimes(1);
      const debugMessages = debugSpy.mock.calls.map(([msg]) => String(msg));
      expect(debugMessages).toEqual(
        expect.arrayContaining([
          "controller logger probe",
          "service logger probe",
          "repository logger probe",
        ])
      );
    } finally {
      getSpy.mockRestore();
      forSpy.mockRestore();
      debugSpy.mockRestore();
    }
  });
});
