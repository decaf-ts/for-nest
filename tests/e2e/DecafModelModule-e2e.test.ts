import { Test } from "@nestjs/testing";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import {
  AuthorizationExceptionFilter,
  ConflictExceptionFilter,
  DecafModule,
  GlobalExceptionFilter,
  HttpExceptionFilter,
  NotFoundExceptionFilter,
  ValidationExceptionFilter,
} from "../../src";
import { Adapter, RamAdapter, RamFlavour } from "@decaf-ts/core";
import { Product } from "./fakes/models";
import { HttpModelClient, HttpModelResponse } from "./fakes/server";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

export function genStr(len: number): string {
  return Math.floor(Math.random() * 1e14)
    .toString()
    .slice(0, len)
    .padStart(len, "0");
}

jest.setTimeout(180000);

describe("DecafModelModule CRUD", () => {
  let app: INestApplication;
  let HttpRequest: HttpModelClient<Product>;

  const productCode = genStr(14);
  const batchNumber = `BATCH${genStr(3)}`;
  const productPayload = { productCode, batchNumber, name: "Product ABC" };
  const id = `${productCode}:${batchNumber}`;

  let created: HttpModelResponse<Product>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        DecafModule.forRootAsync({
          adapter: RamAdapter,
          conf: undefined,
          autoControllers: true,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const exceptions = [
      new HttpExceptionFilter(),
      new ValidationExceptionFilter(),
      new NotFoundExceptionFilter(),
      new ConflictExceptionFilter(),
      new AuthorizationExceptionFilter(),
      new GlobalExceptionFilter(),
    ];
    app.useGlobalFilters(...exceptions);
    await app.init();

    HttpRequest = new HttpModelClient<Product>(app.getHttpServer(), Product);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("CREATE", () => {
    it("should CREATE a product", async () => {
      const product = new Product(productPayload);
      const res = await HttpRequest.post(product);

      expect(res.status).toEqual(201);
      expect(res.toJSON()).toMatchObject(productPayload);
      expect(res.pk).toEqual(id);

      created = res;
    });

    it("should FAIL to CREATE a product with invalid payload", async () => {
      const invalid = new Product({
        productCode: "123",
        batchNumber: "BAD/!!",
        name: "Invalid product",
      });

      const res = await HttpRequest.post(invalid);

      // expect(res.status).toEqual(400);
      expect(res.raw.message).toContain(
        "productCode - The minimum length is 14"
      );
      expect(res.raw.message).toContain(
        "batchNumber - The value does not match the pattern"
      );
    });

    it("should FAIL to CREATE a duplicate product", async () => {
      const duplicate = new Product(productPayload);
      const res = await HttpRequest.post(duplicate);

      // expect(res.status).toEqual(422);
      expect(res.raw.message).toContain(
        `Record with id ${productPayload.productCode}:${productPayload.batchNumber} already exists`
      );
    });
  });

  describe("READ", () => {
    beforeAll(async () => {
      if (!created) {
        const product = new Product(productPayload);
        const res = await HttpRequest.post(product);
        expect(res.status).toEqual(201);
        created = res;
      }
    });

    it("should READ a product by id", async () => {
      const res = await HttpRequest.get(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(res.status).toEqual(200);
      expect(res.data).toEqual(created.data);
    });

    it("should FAIL to READ a non-existing product", async () => {
      const res = await HttpRequest.get("99999999999999", "NOPE");
      expect(res.raw.status).toBeGreaterThanOrEqual(404);
      expect(res.raw.message).toEqual(
        "[NotFoundError] Record with id 99999999999999:NOPE not found in table product"
      );
      expect(res.raw.path).toEqual("/product/99999999999999/NOPE");
    });

    it("should FAIL to READ with missing parameters", async () => {
      const res = await request(app.getHttpServer()).get(`/product/`);
      expect(res.status).toEqual(404);
    });
  });

  // UPDATE

  describe("UPDATE", () => {
    beforeAll(async () => {
      if (!created) {
        const product = new Product(productPayload);
        const res = await HttpRequest.post(product);
        expect(res.status).toEqual(201);
        created = res;
      }
    });

    it("should UPDATE a product", async () => {
      const res = await HttpRequest.put(
        {
          ...created,
          name: "Updated Name",
        },
        created.data.productCode,
        created.data.batchNumber
      );

      expect(res.status).toEqual(200);
      expect(res.data.name).toEqual("Updated Name");
      expect(res.data.productCode).toEqual(created.data.productCode);
      expect(res.data.batchNumber).toEqual(created.data.batchNumber);
    });

    it("should FAIL to UPDATE a non-existing product", async () => {
      const productCode = genStr(14);
      const batchNumber = genStr(14);
      const res = await HttpRequest.put(
        {
          ...created,
          name: "Nothing",
        },
        productCode,
        batchNumber
      );

      // expect(res.status).toEqual(404);
      expect(res.raw.message).toContain(
        `[NotFoundError] Record with id ${productCode}:${batchNumber} not found`
      );
    });

    it("should FAIL to UPDATE with invalid payload", async () => {
      const res = await HttpRequest.put(
        {
          name: 123,
        },
        created.data.productCode,
        created.data.batchNumber
      );

      expect(res.status).toEqual(400);
    });
  });

  describe("DELETE", () => {
    beforeAll(async () => {
      if (!created) {
        const product = new Product(productPayload);
        const res = await HttpRequest.post(product);
        expect(res.status).toEqual(201);
        created = res;
      }
    });

    it("should DELETE a product", async () => {
      const resDelete = await HttpRequest.delete(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(resDelete.status).toEqual(200);

      const resGet = await HttpRequest.get(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(resGet.status).toEqual(404);
    });

    it("should FAIL to DELETE a non-existing product", async () => {
      const res = await HttpRequest.delete(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(res.status).toEqual(404);
    });
  });

  describe("QUERY", () => {
    it("should QUERY using an existing repository method", async () => {
      const p1 = new Product({
        productCode: genStr(14),
        batchNumber: `Q${genStr(3)}`,
        name: "Q1",
      });

      const p2 = new Product({
        productCode: genStr(14),
        batchNumber: `Q${genStr(3)}`,
        name: "Q2",
      });

      await HttpRequest.post(p1);
      await HttpRequest.post(p2);

      // const res = await request(app.getHttpServer()).get(`/product/query/all`);
      // expect(res.status).toEqual(200);
      // expect(Array.isArray(res.body)).toEqual(true);
      // expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it("should FAIL QUERY with an invalid method", async () => {
      const res = await request(app.getHttpServer()).get(
        `/product/query/unknownMethod`
      );
      expect(res.status).toEqual(500);
    });
  });
});
