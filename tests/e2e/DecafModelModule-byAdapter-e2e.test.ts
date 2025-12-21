import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
import {
  Adapter,
  OrderDirection,
  RamAdapter,
  RamFlavour,
} from "@decaf-ts/core";
import { AxiosHttpAdapter, RestService } from "@decaf-ts/for-http";
import { InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { genStr } from "./fakes/utils";
import { Product } from "./fakes/models/Product";
import request from "supertest";
RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

jest.setTimeout(180000);

const host: string = "localhost:3000";
const protocol = "http";

describe("DecafModelModule CRUD by HttpAdapter", () => {
  let app: INestApplication;
  let server;

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

    server = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  const adapter = new AxiosHttpAdapter({
    protocol: protocol,
    host: host,
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
    const prefix = `${adapter.config.protocol}://${adapter.config.host}`;
    url = url.includes(prefix) ? url.substring(prefix.length) : url;
    return url;
  }

  jest
    .spyOn(adapter.client, "request")
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .mockImplementation(async (req: any, ...args: any[]) => {
      switch (req.method) {
        case "GET": {
          const result = await server.get(trimUrl(req.url));
          return result;
        }
        case "POST": {
          const result = await app
            .getHttpServer()
            .post(trimUrl(req.url))
            .send(req.body);
          return result;
        }
        case "PUT": {
          const result = await server.put(trimUrl(req.url)).send(req.body);
          return result;
        }
        case "DELETE": {
          const result = await server.delete(req.url).send();
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
      url = decodeURI(url);
      const result = await server.post(trimUrl(url)).send(body);
      return result;
    });

  jest.spyOn(adapter.client, "get").mockImplementation(async (url: string) => {
    url = decodeURI(url);
    const result = await server.get(trimUrl(url)).send();
    return result;
  });

  jest
    .spyOn(adapter.client, "put")
    .mockImplementation(async (url: string, cfg) => {
      url = decodeURI(url);
      const result = await server.put(trimUrl(url)).send(cfg);
      return result;
    });

  jest
    .spyOn(adapter.client, "delete")
    .mockImplementation(async (url: string) => {
      url = decodeURI(url);
      const result = await server.delete(trimUrl(url)).send();
      return result;
    });
  let created: Product;

  it.skip("creates", async () => {
    created = await repo.create(new Product(productPayload));
    expect(created).toBeDefined();
    expect(created.hasErrors()).toBe(undefined);
  });

  it.skip("reads", async () => {
    const read = await repo.read(created.id);
    expect(read).toBeDefined();
    expect(read.hasErrors()).toBe(undefined);
    expect(read.equals(created)).toBe(true);
  });

  it.skip("updates", async () => {
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

  it.skip("deletes", async () => {
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

  it("Should read in bulk", async () => {
    const ids = bulk.map((c) => c.id).slice(3, 5);

    const read = await repo.readAll(ids);

    expect(read).toBeDefined();
    expect(read.length).toEqual(ids.length);
  });

  it("Should update in bulk", async () => {
    const toUpdate = bulk.slice(0, 5).map(
      (c: Product) =>
        new Product(
          Object.assign({}, c, {
            name: "updated",
          })
        )
    );

    const updated = await repo.updateAll(toUpdate);

    expect(updated).toBeDefined();
    expect(updated.length).toEqual(toUpdate.length);
    expect(updated.every((r, i) => r.equals(bulk[i]))).toEqual(false);
    expect(
      updated.every((r, i) =>
        r.equals(bulk[i], "updatedAt", "updatedBy", "name", "version")
      )
    ).toEqual(true);
  });

  it("Should delete in bulk", async () => {
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
