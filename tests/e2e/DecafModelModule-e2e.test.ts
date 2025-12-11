import { Test } from "@nestjs/testing";
import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DecafExceptionFilter, DecafModule } from "../../src";
import {
  Adapter,
  OrderDirection,
  RamAdapter,
  RamFlavour,
  service,
} from "@decaf-ts/core";
import { Product } from "./fakes/models";
import { HttpModelClient, HttpModelResponse } from "./fakes/server";
import * as path from "path";
import { AxiosHttpAdapter, RestService } from "@decaf-ts/for-http";
import { toKebabCase } from "@decaf-ts/logging";
import { Model } from "@decaf-ts/decorator-validation";
import { NotFoundError } from "@decaf-ts/db-decorators";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

export function genStr(len: number): string {
  return Math.floor(Math.random() * 1e14)
    .toString()
    .slice(0, len)
    .padStart(len, "1");
}

jest.setTimeout(180000);

const CRYPTO_PATH = {
  base: "/home/pccosta/pdm/decaf/decaf-workspace/for-fabric/docker",
  get(f: string) {
    return path.join(this.base, f);
  },
};

const config = {
  cryptoPath: CRYPTO_PATH.get("infrastructure/crypto-config"),
  keyCertOrDirectoryPath: CRYPTO_PATH.get("docker-data/admin/msp/keystore"),
  certCertOrDirectoryPath: CRYPTO_PATH.get("docker-data/admin/msp/signcerts"),
  tlsCert: "", // fs.readFileSync(CRYPTO_PATH.get("docker-data/tls-ca-cert.pem")),
  peerEndpoint: "localhost:7031",
  peerHostAlias: "localhost",
  chaincodeName: "global",
  ca: "org-a",
  mspId: "Peer0OrgaMSP",
  channel: "simple-channel",
};

@service("TesteService")
export class TesteService {
  constructor() {}
}

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
          // adapter: FabricClientAdapter as any,
          conf: undefined, //config,
          autoControllers: true,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const exceptions = [new DecafExceptionFilter()];
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
      expect(res.raw.error).toContain("productCode - The minimum length is 14");
      expect(res.raw.error).toContain(
        "batchNumber - The value does not match the pattern"
      );
    });

    it("should FAIL to CREATE a duplicate product", async () => {
      const duplicate = new Product(productPayload);
      const res = await HttpRequest.post(duplicate);

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
      expect(res.raw.error).toContain(
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

  describe.skip("DELETE", () => {
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

      const r1 = await HttpRequest.post(p1);
      const r2 = await HttpRequest.post(p2);
      console.log(r1, r2);

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

  describe("Http Adapter Integration", () => {
    const adapter = new AxiosHttpAdapter({
      protocol: "http",
      host: "localhost:3000",
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
            const result = await HttpRequest.get(trimUrl(req.url));
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(new Error(result.status.toString()));
            }
            return result;
          }
          case "POST": {
            const result = await HttpRequest.post(req.data);
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(new Error(result.status.toString()));
            }
            return result;
          }
          case "PUT": {
            const result = await HttpRequest.put(req.data);
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(new Error(result.status.toString()));
            }
            return result;
          }
          case "DELETE": {
            const result = await HttpRequest.delete(trimUrl(req.url));
            if (!result.status.toString().startsWith("20")) {
              throw adapter.parseError(new Error(result.status.toString()));
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
        const result = await HttpRequest.post(body);
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return result.data;
      });

    jest
      .spyOn(adapter.client, "get")
      .mockImplementation(async (url: string) => {
        url = trimUrl(url);
        const result = await HttpRequest.get(...url.split("/"));
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return result.data;
      });

    jest
      .spyOn(adapter.client, "put")
      .mockImplementation(async (url: string, cfg) => {
        url = trimUrl(url);
        const result = await HttpRequest.put(cfg, ...url.split("/"));
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return new repo.class(result.data);
      });

    jest
      .spyOn(adapter.client, "delete")
      .mockImplementation(async (url: string) => {
        url = trimUrl(url);
        const result = await HttpRequest.delete(...url.split("/"));
        if (!result.status.toString().startsWith("20")) {
          throw adapter.parseError(new Error(result.status.toString()));
        }
        return new repo.class(result.data);
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
    });

    it("deletes", async () => {
      const deleted = await repo.delete(created.id);
      expect(deleted).toBeDefined();
      expect(deleted.hasErrors()).toBe(undefined);
      await expect(repo.read(created.id)).rejects.toThrow(NotFoundError);
    });

    it("runs prepared statements listBy", async () => {
      const list = await repo.listBy("name", OrderDirection.DSC);
      expect(list).toBeDefined();
      expect(list.length).toBeGreaterThanOrEqual(1);
    });

    it("runs prepared statements via select", async () => {
      const list = await repo
        .select(["id"])
        .where(repo.attr("name").eq("new name"))
        .execute();
      expect(list).toBeDefined();
      expect(list.length).toBeGreaterThanOrEqual(1);
    });
  });
});
