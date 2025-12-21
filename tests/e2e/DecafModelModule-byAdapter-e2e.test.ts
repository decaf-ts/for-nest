import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
import {
  Adapter,
  OrderDirection,
  PreparedStatementKeys,
  RamAdapter,
  RamFlavour,
} from "@decaf-ts/core";
import { HttpModelClient } from "./fakes/server";
import {
  AxiosHttpAdapter,
  HttpAdapter,
  NestJSResponseParser,
  RestService,
} from "@decaf-ts/for-http";
import { toKebabCase } from "@decaf-ts/logging";
import { Model } from "@decaf-ts/decorator-validation";
import {
  BulkCrudOperationKeys,
  InternalError,
  NotFoundError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { genStr } from "./fakes/utils";
import { Product } from "./fakes/models/Product";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

jest.setTimeout(180000);

describe("DecafModelModule CRUD by HttpAdapter", () => {
  let app: INestApplication;
  let productHttpClient: HttpModelClient<Product>;

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

  afterAll(async () => {
    await app?.close();
  });

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

  jest.spyOn(adapter.client, "get").mockImplementation(async (url: string) => {
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
