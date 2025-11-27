import { Test } from "@nestjs/testing";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { FakeHandler } from "./fakes/fake.handler";
import { DecafModule } from "../../src";
import { Adapter, RamAdapter, RamFlavour } from "@decaf-ts/core";
import { Fake } from "./fakes/fake.model";
import { Model } from "@decaf-ts/decorator-validation";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

describe("DecafModule RequestHandlerInterceptor", () => {
  let app: INestApplication;
  let HttpRequest: any;

  beforeAll(async () => {
    const f = new Fake({ id: Math.random().toString(), name: "Faker" });
    const moduleRef = await Test.createTestingModule({
      imports: [
        DecafModule.forRootAsync({
          adapter: RamAdapter,
          conf: undefined,
          autoControllers: true,
          handlers: [FakeHandler],
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const server = app.getHttpServer();
    HttpRequest = request(server);
  });

  afterAll(async () => {
    await app.close();
  });

  it("should execute registered handlers", async () => {
    const spy = jest.spyOn(FakeHandler.prototype, "handle");
    const route = `/${Model.tableName(Fake)}`;
    const payloads = [
      { id: Math.random().toString(36).slice(2), name: "John" },
      { id: Math.random().toString(36).slice(2), name: "Maria" },
    ];

    const responses = await Promise.all(
      payloads.map((body) => HttpRequest.post(route).send(body))
    );

    responses.forEach((res) => expect(res.status).toBe(201));
    expect(spy).toBeCalledTimes(payloads.length);

    responses.forEach((res, idx) => {
      const expected = `fake-cert-${payloads[idx].id}`;
      expect(res.headers["x-decaf-cert"]).toBe(expected);
    });
  });
});
