import "../../src/decoration";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DecafModule } from "../../src";
import { Adapter } from "@decaf-ts/core";
// @ts-expect-error ram
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { RamTransformer } from "@decaf-ts/for-http/server";
import { AuthModule } from "./fakes/auth.module";
import { AuthHttpModelClient } from "./fakes/serverAuth";
import { Product } from "./fakes/models/ProductAdmin";
import { MockAuthHandler } from "./fakes/mockAuth";
import { genStr } from "./fakes/utils";
import { AuthInterceptor } from "../../src/auth/AuthInterceptor";
import { DecafRequestHandlerInterceptor } from "../../src/interceptors/DecafRequestHandlerInterceptor";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

describe("AuthInterceptor order", () => {
  let app: INestApplication;
  let ProductHttpRequest: AuthHttpModelClient<Product>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule,
        DecafModule.forRootAsync({
          conf: [[RamAdapter, { user: "root" }, new RamTransformer()]],
          autoControllers: true,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0);

    ProductHttpRequest = new AuthHttpModelClient<Product>(
      app.getHttpServer(),
      Product
    );
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("runs DecafRequestHandlerInterceptor before AuthInterceptor and AuthHandler", async () => {
    const order: string[] = [];

    const originalAuthIntercept = AuthInterceptor.prototype.intercept;
    const originalDecafIntercept =
      DecafRequestHandlerInterceptor.prototype.intercept;
    const originalAuthAuthorize = MockAuthHandler.prototype.authorize;

    jest
      .spyOn(AuthInterceptor.prototype, "intercept")
      .mockImplementation(function (ctx, next) {
        order.push("auth-interceptor");
        return originalAuthIntercept.call(this, ctx, next);
      });

    jest
      .spyOn(DecafRequestHandlerInterceptor.prototype, "intercept")
      .mockImplementation(function (ctx, next) {
        order.push("decaf-interceptor");
        return originalDecafIntercept.call(this, ctx, next);
      });

    jest
      .spyOn(MockAuthHandler.prototype, "authorize")
      .mockImplementation(function (this: any, ...args: any[]) {
        order.push("auth-handler");
        return (originalAuthAuthorize as any).apply(this, args);
      });

    const productCode = genStr(14);
    const batchNumber = `BATCH${genStr(3)}`;
    const res = await ProductHttpRequest.post(
      { productCode, batchNumber, name: "order-test" },
      "admin"
    );

    expect(res.status).toEqual(201);

    const authInterceptorIndex = order.indexOf("auth-interceptor");
    const authHandlerIndex = order.indexOf("auth-handler");
    const decafInterceptorIndex = order.indexOf("decaf-interceptor");

    expect(authInterceptorIndex).toBeGreaterThanOrEqual(0);
    expect(authHandlerIndex).toBeGreaterThanOrEqual(0);
    expect(decafInterceptorIndex).toBeGreaterThanOrEqual(0);
    expect(decafInterceptorIndex).toBeLessThan(authInterceptorIndex);
    expect(decafInterceptorIndex).toBeLessThan(authHandlerIndex);
  });

  it.skip("always runs DecafRequestHandlerInterceptor before AuthInterceptor/AuthHandler", async () => {
    const order: string[] = [];
    const runs: string[][] = [];

    const originalAuthIntercept = AuthInterceptor.prototype.intercept;
    const originalDecafIntercept =
      DecafRequestHandlerInterceptor.prototype.intercept;
    const originalAuthAuthorize = MockAuthHandler.prototype.authorize;

    jest
      .spyOn(AuthInterceptor.prototype, "intercept")
      .mockImplementation(function (ctx, next) {
        order.push("auth-interceptor");
        return originalAuthIntercept.call(this, ctx, next);
      });

    jest
      .spyOn(DecafRequestHandlerInterceptor.prototype, "intercept")
      .mockImplementation(function (ctx, next) {
        order.push("decaf-interceptor");
        return originalDecafIntercept.call(this, ctx, next);
      });

    jest
      .spyOn(MockAuthHandler.prototype, "authorize")
      .mockImplementation(function (this: any, ...args: any[]) {
        order.push("auth-handler");
        return (originalAuthAuthorize as any).apply(this, args);
      });

    const recordRun = () => {
      if (order.length) {
        runs.push([...order]);
        order.length = 0;
      }
    };

    const createProduct = async () => {
      const productCode = genStr(14);
      const batchNumber = `BATCH${genStr(3)}`;
      const res = await ProductHttpRequest.post(
        { productCode, batchNumber, name: "order-test" },
        "admin"
      );
      expect(res.status).toEqual(201);
      recordRun();
    };

    await createProduct();
    await createProduct();

    expect(runs).toHaveLength(2);
    for (const run of runs) {
      const authInterceptorIndex = run.indexOf("auth-interceptor");
      const authHandlerIndex = run.indexOf("auth-handler");
      const decafInterceptorIndex = run.indexOf("decaf-interceptor");

      expect(authInterceptorIndex).toBeGreaterThanOrEqual(0);
      expect(decafInterceptorIndex).toBeGreaterThanOrEqual(0);
      expect(decafInterceptorIndex).toBeLessThan(authInterceptorIndex);
      expect(authHandlerIndex).toBeGreaterThan(authInterceptorIndex);
    }
  });
});
