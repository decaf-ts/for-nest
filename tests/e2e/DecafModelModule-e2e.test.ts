// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Test } from "@nestjs/testing";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
import {
  Adapter,
  OrderDirection,
  RamAdapter,
  RamFlavour,
  service,
  PreparedStatementKeys,
} from "@decaf-ts/core";
import { HttpModelClient, HttpModelResponse } from "./fakes/server";
import {
  AxiosHttpAdapter,
  HttpAdapter,
  NestJSResponseParser,
  RestService,
} from "@decaf-ts/for-http";
import { toKebabCase } from "@decaf-ts/logging";
import { Model } from "@decaf-ts/decorator-validation";
import {
  NotFoundError,
  BulkCrudOperationKeys,
  OperationKeys,
  InternalError,
} from "@decaf-ts/db-decorators";
import { genStr } from "./fakes/utils";
import { Product } from "./fakes/models/Product";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

jest.setTimeout(180000);

@service("TesteService")
export class TesteService {
  constructor() {}
}

describe("DecafModelModule CRUD", () => {
  let app: INestApplication;
  let productHttpClient: HttpModelClient<Product>;

  const productCode = genStr(14);
  const batchNumber = `BATCH${genStr(3)}`;
  const productPayload = { productCode, batchNumber, name: "Product ABC" };
  const id = `${productCode}:${batchNumber}`;

  let created: HttpModelResponse<Product>;

  beforeAll(async () => {
    app = await NestFactory.create(
      DecafModule.forRootAsync({
        adapter: RamAdapter,
        conf: undefined,
        autoControllers: true,
        autoServices: false,
      })
    );

    app.useGlobalFilters(new DecafExceptionFilter());

    await app.init();

    productHttpClient = new HttpModelClient<Product>(
      app.getHttpServer(),
      Product
    );
  });

  // beforeAll(async () => {
  //   const moduleRef = await Test.createTestingModule({
  //     imports: [
  //       DecafModule.forRootAsync({
  //         adapter: RamAdapter,
  //         conf: undefined,
  //         autoControllers: true,
  //       }),
  //     ],
  //   }).compile();
  //
  //   app = moduleRef.createNestApplication();
  //   const exceptions = [new DecafExceptionFilter()];
  //   app.useGlobalFilters(...exceptions);
  //   await app.init();
  //
  //   productHttpClient = new HttpModelClient<Product>(
  //     app.getHttpServer(),
  //     Product
  //   );
  // });

  afterAll(async () => {
    await app.close();
  });

  describe("CREATE", () => {
    it("should CREATE a product", async () => {
      const product = new Product(productPayload);
      const res = await productHttpClient.post(product);

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

      const res = await productHttpClient.post(invalid);

      // expect(res.status).toEqual(400);
      expect(res.raw.error).toContain("productCode - The minimum length is 14");
      expect(res.raw.error).toContain(
        "batchNumber - The value does not match the pattern"
      );
    });

    it("should FAIL to CREATE a duplicate product", async () => {
      const duplicate = new Product(productPayload);
      const res = await productHttpClient.post(duplicate);

      // expect(res.status).toEqual(422);
      expect(res.raw.error).toContain(
        `Record with id ${productPayload.productCode}:${productPayload.batchNumber} already exists`
      );
    });
  });

  describe("READ", () => {
    beforeAll(async () => {
      if (!created) {
        const product = new Product(productPayload);
        const res = await productHttpClient.post(product);
        expect(res.status).toEqual(201);
        created = res;
      }
    });

    it("should READ a product by id", async () => {
      const res = await productHttpClient.get(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(res.status).toEqual(200);
      expect(res.data).toEqual(created.data);
    });

    it("should FAIL to READ a non-existing product", async () => {
      const res = await productHttpClient.get("99999999999999", "NOPE");
      expect(res.raw.status).toBeGreaterThanOrEqual(404);
      expect(res.raw.error).toEqual(
        "[NotFoundError] Record with id 99999999999999:NOPE not found in table product"
      );
      expect(res.raw.path).toEqual("/product/99999999999999/NOPE");
    });

    it("should FAIL to READ with missing parameters", async () => {
      const res = await request(app.getHttpServer()).get(`/product/`);
      expect(res.status).toEqual(500);
    });
  });

  describe.skip("UPDATE", () => {
    beforeAll(async () => {
      if (!created) {
        const product = new Product(productPayload);
        const res = await productHttpClient.post(product);
        expect(res.status).toEqual(201);
        created = res;
      }
    });

    it("should UPDATE a product", async () => {
      const res = await productHttpClient.put(
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
      const res = await productHttpClient.put(
        {
          ...created,
          name: "Nothing",
        },
        productCode,
        batchNumber
      );

      // expect(res.status).toEqual(404);
      expect(res.raw.error).toContain(
        `[NotFoundError] Record with id ${productCode}:${batchNumber} not found`
      );
    });

    it("should FAIL to UPDATE with invalid payload", async () => {
      const res = await productHttpClient.put(
        {
          name: 123,
        },
        created.data.productCode,
        created.data.batchNumber
      );

      expect(res.status).toEqual(400);
    });
  });

  describe.skip("DELETE", () => {
    beforeAll(async () => {
      if (!created) {
        const product = new Product(productPayload);
        const res = await productHttpClient.post(product);
        expect(res.status).toEqual(201);
        created = res;
      }
    });

    it("should DELETE a product", async () => {
      const resDelete = await productHttpClient.delete(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(resDelete.status).toEqual(200);

      const resGet = await productHttpClient.get(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(resGet.status).toEqual(404);
    });

    it("should FAIL to DELETE a non-existing product", async () => {
      const res = await productHttpClient.delete(
        created.data.productCode,
        created.data.batchNumber
      );
      expect(res.status).toEqual(404);
    });
  });

  describe("QUERY", () => {
    it.skip("should QUERY using an existing repository method", async () => {
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

      const r1 = await productHttpClient.post(p1);
      const r2 = await productHttpClient.post(p2);
      console.log(r1, r2);

      // const res = await request(app.getHttpServer()).get(`/product/query/all`);
      // expect(res.status).toEqual(200);
      // expect(Array.isArray(res.body)).toEqual(true);
      // expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it.skip("should FAIL QUERY with an invalid method", async () => {
      const res = await request(app.getHttpServer()).get(
        `/product/query/unknownMethod`
      );
      expect(res.status).toEqual(500);
    });
  });

  describe("Http Adapter Integration", () => {
    class Parser extends NestJSResponseParser {
      constructor() {
        super();
      }

      override parse(
        method: string,
        response: {
          status: number;
          raw: any;
          data: any;
        }
      ): any {
        if (!(response.status >= 200 && response.status < 300))
          throw HttpAdapter.parseError(response.status.toString());

        switch (method) {
          case BulkCrudOperationKeys.CREATE_ALL:
          case BulkCrudOperationKeys.READ_ALL:
          case BulkCrudOperationKeys.UPDATE_ALL:
          case BulkCrudOperationKeys.DELETE_ALL:
          case PreparedStatementKeys.FIND_BY:
          case PreparedStatementKeys.LIST_BY:
          case PreparedStatementKeys.PAGE_BY:
            return response.raw;
          case OperationKeys.CREATE:
          case OperationKeys.READ:
          case OperationKeys.UPDATE:
          case OperationKeys.DELETE:
            return response.data;
          case PreparedStatementKeys.FIND_ONE_BY:
          case "statement":
          default:
            return response.raw;
        }
      }
    }

    const adapter = new AxiosHttpAdapter({
      protocol: "http",
      host: "localhost:3000",
      responseParser: new Parser(),
    });
    const productCode = genStr(14);
    const batchNumber = `BATCH${genStr(3)}`;
    const productPayload = {
      productCode,
      batchNumber,
      name: "Other Product ABC",
    };

    const repo = new RestService(adapter, Product);

    function trimUrl(url: string) {
      const prefix = `${adapter.config.protocol}://${adapter.config.host}/${toKebabCase(Model.tableName(repo.class))}`;
      url = url.includes(prefix) ? url.substring(prefix.length) : url;
      return url.startsWith("/") ? url.substring(1) : url;
    }

    jest
      .spyOn(adapter.client, "request")
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .mockImplementation(async (req: any, ...args: any[]) => {
        switch (req.method) {
          case "GET": {
            const result = await productHttpClient.get(trimUrl(req.url));
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(
                new Error((result as any).status.toString())
              );
            }
            return result;
          }
          case "POST": {
            const result = await productHttpClient.post(req.data);
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(
                new Error((result as any).status.toString())
              );
            }
            return result;
          }
          case "PUT": {
            const result = await productHttpClient.put(req.data);
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(
                new Error((result as any).status.toString())
              );
            }
            return result;
          }
          case "DELETE": {
            const result = await productHttpClient.delete(trimUrl(req.url));
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(
                new Error((result as any).status.toString())
              );
            }
            return result;
          }
          default:
            throw new Error("Method not implemented.");
        }
      });

    jest
      .spyOn(adapter.client, "post")
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .mockImplementation(async (url: string, body: any, cfg: any) => {
        let params = url.split("product/") || [];
        if (params.length === 2) params = params[1].split("/");
        else params = [];
        const result = await productHttpClient.post(body, ...params);
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return result;
      });

    jest
      .spyOn(adapter.client, "get")
      .mockImplementation(async (url: string) => {
        url = trimUrl(url);
        const result = await productHttpClient.get(...url.split("/"));
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return result;
      });

    jest
      .spyOn(adapter.client, "put")
      .mockImplementation(async (url: string, cfg) => {
        url = trimUrl(url);
        const result = await productHttpClient.put(cfg, ...url.split("/"));
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return result;
      });

    jest
      .spyOn(adapter.client, "delete")
      .mockImplementation(async (url: string) => {
        url = trimUrl(url);
        const result = await productHttpClient.delete(...url.split("/"));
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return result;
      });
    let created: Product;

    it("creates", async () => {
      created = await repo.create(new Product(productPayload));
      expect(created).toBeDefined();
      expect(created.hasErrors()).toBe(undefined);
    });

    it("reads", async () => {
      const read = await repo.read(created.id);
      expect(read).toBeDefined();
      expect(read.hasErrors()).toBe(undefined);
      expect(read.equals(created)).toBe(true);
    });

    it("updates", async () => {
      const updated = await repo.update(
        new Product(Object.assign({}, created, { name: "new name" }))
      );
      expect(updated).toBeDefined();
      expect(updated.hasErrors()).toBe(undefined);
      expect(updated.equals(created, "name", "updatedAt")).toBe(true);

      const read = await repo.read(created.id);
      expect(read).toBeDefined();
      expect(read.hasErrors()).toBe(undefined);
      expect(read.equals(updated)).toBe(true);
    });

    it("deletes", async () => {
      const deleted = await repo.delete(created.id);
      expect(deleted).toBeDefined();
      expect(deleted.hasErrors()).toBe(undefined);
      await expect(repo.read(created.id)).rejects.toThrow(NotFoundError);
    });

    let bulk: Product[];

    it("Should create in bulk", async () => {
      const models = Object.keys(new Array(10).fill(0)).map(
        (i) =>
          new Product({
            productCode: genStr(14),
            batchNumber: `BATCH${i}`,
            name: "name" + i,
          })
      );

      bulk = await repo.createAll(models);

      expect(bulk).toBeDefined();
      expect(bulk.length).toEqual(models.length);
      expect(bulk.every((c) => !c.hasErrors())).toEqual(true);
    });

    it.skip("Should read in bulk", async () => {
      const ids = bulk.map((c) => c.id).slice(3, 5);

      const read = await repo.readAll(ids);

      expect(read).toBeDefined();
      expect(read.length).toEqual(ids.length);
    });

    it.skip("Should update in bulk", async () => {
      const toUpdate = bulk.slice(0, 5).map((c: Product) => {
        c.name = "updated";
        return c;
      });

      const updated = await repo.updateAll(toUpdate);

      expect(updated).toBeDefined();
      expect(updated.length).toEqual(toUpdate.length);
      expect(updated.every((r, i) => r.equals(created[i]))).toEqual(false);
      expect(
        updated.every((r, i) =>
          r.equals(created[i], "updatedAt", "updatedBy", "city", "version")
        )
      ).toEqual(true);
    });

    it.skip("Should delete in bulk", async () => {
      const ids = bulk.map((c) => c.id).slice(3, 5);

      const deleted = await repo.deleteAll(ids);

      expect(deleted).toBeDefined();
      expect(deleted.length).toEqual(ids.length);
      for (const id of ids) {
        await expect(repo.read(id)).rejects.toThrow(NotFoundError);
      }

      bulk.splice(3, 5);
      await expect(repo.readAll(ids)).rejects.toThrow(NotFoundError);
    });

    it("runs prepared statements listBy", async () => {
      const list = await repo.listBy("name", OrderDirection.DSC);
      expect(list).toBeDefined();
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it("fails to run non prepared statements", async () => {
      await expect(
        repo.select(["id"]).where(repo.attr("name").eq("new name")).execute()
      ).rejects.toThrow(InternalError);
    });

    it("runs squashable statements via select", async () => {
      const list = await repo
        .select()
        .where(repo.attr("name").eq("new name"))
        .execute();
      expect(list).toBeDefined();
      // expect(list.length).toBeGreaterThanOrEqual(1);
    });
  });
});
