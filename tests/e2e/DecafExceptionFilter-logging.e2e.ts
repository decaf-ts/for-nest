import {
  CanActivate,
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  Injectable,
  UseGuards,
} from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ModuleRef } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
import { Adapter } from "@decaf-ts/core";
// @ts-expect-error ram
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { Fake } from "./fakes/models/Fake";
import { Model } from "@decaf-ts/decorator-validation";
import { RamTransformer } from "@decaf-ts/for-http/server";
import { Logging, MiniLogger } from "@decaf-ts/logging";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

@Injectable()
class AlwaysRejectGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException("nope");
  }
}

@Controller("guarded")
class GuardedController {
  @UseGuards(AlwaysRejectGuard)
  @Get()
  get() {
    return "unreachable";
  }
}

/**
 * Proves that DecafExceptionFilter logs through the same request-bound
 * logger instance that DecafRequestHandlerInterceptor stamped onto the
 * request's DecafRequestContext (client/ip-bound, per-request) — not a
 * fresh Logging.get() call with no request correlation.
 */
describe("DecafExceptionFilter request-bound logging (e2e)", () => {
  let app: INestApplication;
  let HttpRequest: ReturnType<typeof request>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DecafModule.forRootAsync({
          conf: [[RamAdapter, {}, new RamTransformer()]],
          autoControllers: true,
        }),
      ],
      controllers: [GuardedController],
      providers: [AlwaysRejectGuard],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(
      new DecafExceptionFilter(app.get(ModuleRef, { strict: false }))
    );
    await app.init();

    HttpRequest = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it("uses the exact per-request logger proxy created by the interceptor, not a fresh Logging.get()", async () => {
    const forSpy = jest.spyOn(MiniLogger.prototype, "for");
    const errorSpy = jest.spyOn(MiniLogger.prototype, "error");
    const freshGlobalLogger = Logging.get();

    const route = `/${Model.tableName(Fake)}`;
    const res = await HttpRequest.get(`${route}/does-not-exist`);

    expect(res.status).toBe(404); // NotFoundError from the repository layer

    // The interceptor's `Logging.get().for({ ip })` call is what stamps the
    // per-request logger onto DecafRequestContext.
    const contextualizeCall = forSpy.mock.calls.find(
      ([arg]) => arg && typeof arg === "object" && "ip" in (arg as object)
    );
    expect(contextualizeCall).toBeDefined();
    const requestBoundLogger = forSpy.mock.results[
      forSpy.mock.calls.indexOf(contextualizeCall!)
    ].value;

    expect(errorSpy).toHaveBeenCalled();
    const errorCall = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes(`GET ${route}/does-not-exist`)
    );
    expect(errorCall).toBeDefined();
    const loggerInstanceUsed = errorSpy.mock.instances[
      errorSpy.mock.calls.indexOf(errorCall!)
    ];

    // Identity check: the filter logged through the SAME per-request proxy,
    // not through the plain global logger.
    expect(loggerInstanceUsed).toBe(requestBoundLogger);
    expect(loggerInstanceUsed).not.toBe(freshGlobalLogger);

    forSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("still responds and still logs when a guard rejects before any Context binding happens", async () => {
    const errorSpy = jest.spyOn(MiniLogger.prototype, "error");

    const res = await HttpRequest.get("/guarded");

    // The response must go out regardless of how (or whether) logging succeeded,
    // and the guard's real 403 must survive — not get flattened into a 500.
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ status: 403 });

    // It must still be logged — through whichever logger was available — even
    // though DecafRequestHandlerInterceptor never got to bind ip/user/etc.
    // onto the Context because the guard threw first.
    expect(errorSpy).toHaveBeenCalled();
    const errorCall = errorSpy.mock.calls.find((call) =>
      String(call[0]).includes("GET /guarded")
    );
    expect(errorCall).toBeDefined();

    errorSpy.mockRestore();
  });
});
