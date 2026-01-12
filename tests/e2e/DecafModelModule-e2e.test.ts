import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { DecafExceptionFilter, DecafModule, route } from "../../src";
import {
  Adapter,
  OrderDirection,
  query,
  Repository,
  repository,
} from "@decaf-ts/core";

// @ts-expect-error  import from ram
import { RamFlavour, RamAdapter } from "@decaf-ts/core/ram";
import { HttpModelClient, HttpModelResponse } from "./fakes/server";
import { genStr } from "./fakes/utils";
import { Product } from "./fakes/models/Product";
import { NestFactory } from "@nestjs/core";

Adapter.setCurrent(RamFlavour);

jest.setTimeout(180000);

@repository(Product)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class CustomProductRepository extends Repository<
  Product,
  Adapter<any, any, any, any>
> {
  constructor(adapter: Adapter<any, any, any, any>) {
    super(adapter, Product);
  }

  @query()
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async findByCountry(country: string) {
    throw new Error("Should be override by @query decorator");
  }

  @query()
  async findByExpiryDateLessThanAndExpiryDateGreaterThanOrderByExpiryDate(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expyDateLt: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    expyDateGt: number
  ) {
    throw new Error("Should be override by @query decorator");
  }

  @route("POST", "metadata/for-product")
  async createMetadata(body: Product) {
    return { ...body, id: `${body.productCode}` };
  }

  @route("GET", "metadata/for-product/:productCode")
  async metadata(productCode: string) {
    if (!productCode.startsWith("00")) throw new Error("Invalid product code!");

    return { productCode, metadata: Math.random() };
  }
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

  afterAll(async () => {
    await app?.close();
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
        "[NotFoundError][404] Record with id 99999999999999:NOPE not found in table product"
      );
      expect(res.raw.path).toEqual("/product/99999999999999/NOPE");
    });

    it("should FAIL to READ with missing parameters", async () => {
      const res = await request(app.getHttpServer()).get(`/product/`);
      expect(res.status).toEqual(500);
    });
  });

  describe("UPDATE", () => {
    beforeAll(async () => {
      if (!created) {
        const product = new Product(productPayload);
        const res = await productHttpClient.post(product);
        expect(res.status).toEqual(201);
        created = res;
      }
    });

    it("should UPDATE a product", async () => {
      const name = `Updated Name ${Math.random()}`.replace(".", "");
      const res = await productHttpClient.put(
        {
          ...created.toJSON(),
          name: name,
        },
        created.data.productCode,
        created.data.batchNumber
      );

      expect(res.status).toEqual(200);
      expect(res.data.name).toEqual(name);
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
        `[NotFoundError][404] Record with id ${productCode}:${batchNumber} not found`
      );
    });

    it.skip("should FAIL to UPDATE with invalid payload", async () => {
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

  describe("DELETE", () => {
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

  describe("QUERY STATEMENTS", () => {
    function sortByField<T>(
      data: readonly T[],
      field: keyof T,
      direction: OrderDirection
    ): T[] {
      return [...data].sort((a, b) => {
        const aValue = a[field];
        const bValue = b[field];

        const aNum = aValue instanceof Date ? aValue.getTime() : Number(aValue);
        const bNum = bValue instanceof Date ? bValue.getTime() : Number(bValue);

        return direction === OrderDirection.ASC ? aNum - bNum : bNum - aNum;
      });
    }

    const products: Product[] = [];
    beforeAll(async () => {
      const repo = Repository.forModel(Product);
      const payload = [
        {
          productCode: "40700719670720",
          batchNumber: "BATCH-001",
          name: "Olive Oil",
          country: "PT",
          expiryDate: new Date("2025-01-10"),
        },
        {
          productCode: "40700719670720",
          batchNumber: "BATCH-101",
          name: "Porto Wine",
          country: "PT",
          expiryDate: new Date("2050-06-01"),
        },
        {
          productCode: "40700719670720",
          batchNumber: "BATCH-002",
          name: "Italian Pasta",
          country: "IT",
          expiryDate: new Date("2025-06-15"),
        },
        {
          productCode: "40700719670720",
          batchNumber: "BATCH-003",
          name: "French Cheese",
          country: "FR",
          expiryDate: new Date("2025-06-20"),
        },
        {
          productCode: "40700719670720",
          batchNumber: "BATCH-004",
          name: "Spanish Ham",
          country: "ES",
          expiryDate: new Date("2026-06-01"),
        },
        {
          productCode: "40700719670720",
          batchNumber: "BATCH-005",
          name: "Brazilian Coffee",
          country: "BR",
          expiryDate: new Date("2027-12-01"),
        },
      ].map((x) => new Product({ ...x, expiryDate: Number(x.expiryDate) }));

      for (const p of payload) {
        products.push(await repo.create(p));
      }
      expect(products.length).toEqual(payload.length);
    });

    describe("findByCountry", () => {
      it("should return only PT products", async () => {
        const resp = await productHttpClient.query("findByCountry", "PT");
        expect(resp.status).toBe(200);
        expect(Array.isArray(resp.raw)).toBe(true);
        expect(resp.raw).toHaveLength(2);

        const countries = resp.raw.map((x: any) => x.country);
        expect(new Set(countries)).toEqual(new Set(["PT"]));
        for (const item of resp.raw) {
          expect(item).toEqual(
            expect.objectContaining({
              productCode: "40700719670720",
              country: "PT",
              batchNumber: expect.any(String),
              name: expect.any(String),
              expiryDate: expect.anything(),
            })
          );
        }
      });

      it("should return empty array for unknown country", async () => {
        const resp = await productHttpClient.query("findByCountry", "ZZ");
        expect(resp.status).toBe(200);
        expect(Array.isArray(resp.raw)).toBe(true);
        expect(resp.raw).toHaveLength(0);
      });

      it("should reject request for invalid country", async () => {
        const resp = await productHttpClient.query("findByCountry/");
        // no matches any route
        expect(resp.status).toEqual(404);
      });
    });

    describe("findByExpiryDateGreaterThanAndExpiryDateLessThan", () => {
      it("should return products with expiryDate between 2025-01-01 and 2025-12-31 (ASC)", async () => {
        const gtExpiryDate = Number(new Date("2025-01-01"));
        const ltExpiryDate = Number(new Date("2025-12-31"));
        const resp = await productHttpClient.query(
          "findByExpiryDateLessThanAndExpiryDateGreaterThanOrderByExpiryDate",
          ltExpiryDate,
          gtExpiryDate + "?direction=asc"
        );
        expect(resp.status).toBe(200);
        expect(Array.isArray(resp.raw)).toBe(true);

        const batches = resp.raw.map((x) => x.batchNumber);
        expect(batches).toMatchObject(["BATCH-001", "BATCH-002", "BATCH-003"]);

        // asc order
        const expectedOrder = sortByField(
          products,
          "expiryDate",
          OrderDirection.ASC
        ).filter((x) => batches.includes(x.batchNumber));
        expect(resp.bulkData).toEqual(expectedOrder);
      });

      it("should return products with expiryDate between 2025-01-01 and 2025-12-31 (DSC)", async () => {
        const gtExpiryDate = Number(new Date("2025-01-01"));
        const ltExpiryDate = Number(new Date("2025-12-31"));
        const resp = await productHttpClient.query(
          "findByExpiryDateLessThanAndExpiryDateGreaterThanOrderByExpiryDate",
          ltExpiryDate,
          gtExpiryDate + `?direction=${OrderDirection.DSC}`
        );
        expect(resp.status).toBe(200);
        expect(Array.isArray(resp.raw)).toBe(true);

        const batches = resp.raw.map((x) => x.batchNumber);
        expect(batches).toMatchObject(["BATCH-003", "BATCH-002", "BATCH-001"]);

        // dsc order
        const expectedOrder = sortByField(
          products,
          "expiryDate",
          OrderDirection.DSC
        ).filter((x) => batches.includes(x.batchNumber));
        expect(resp.bulkData).toEqual(expectedOrder);
      });

      it("should respect exclusivity of GreaterThan and LessThan (edge cases)", async () => {
        const gtExpiryDate = Number(new Date("2025-01-10"));
        const ltExpiryDate = Number(new Date("2025-06-20"));
        const resp = await productHttpClient.query(
          "findByExpiryDateLessThanAndExpiryDateGreaterThanOrderByExpiryDate",
          ltExpiryDate,
          gtExpiryDate + `?direction=${OrderDirection.ASC}`
        );

        expect(resp.status).toBe(200);
        expect(Array.isArray(resp.raw)).toBe(true);

        // expect only BATCH-002 (2025-06-15), because
        // BATCH-001 (2025-01-10) and BATCH-003 (2025-06-20)
        // are edge cases
        const batches = resp.raw.map((x) => x.batchNumber);
        expect(batches).toEqual(["BATCH-002"]);
      });

      it("should return empty when range has no matches", async () => {
        const gtExpiryDate = Number(new Date("2050-01-02"));
        const ltExpiryDate = Number(new Date("2050-01-02"));
        const resp = await productHttpClient.query(
          "findByExpiryDateLessThanAndExpiryDateGreaterThanOrderByExpiryDate",
          gtExpiryDate,
          ltExpiryDate + "?direction=asc"
        );
        expect(resp.status).toBe(200);
        expect(Array.isArray(resp.raw)).toBe(true);
        expect(resp.raw).toHaveLength(0);
      });
    });
  });

  describe("ROUTE", () => {
    let product!: Product;
    const route = "metadata/for-product";

    beforeAll(async () => {
      const repo = Repository.forModel(Product);
      const payload = new Product({
        productCode: "00399113067865",
        batchNumber: "BATCH-METADATA-001",
        name: "Metadata",
        country: "PT",
        expiryDate: Number(new Date("2030-01-01")),
      });
      product = await repo.create(payload);
    });

    describe("POST /metadata", () => {
      it.skip("should return product metadata created", async () => {
        const resp = await productHttpClient.post(
          { productCode: product.productCode },
          route
        );
        expect(resp.status).toBe(200);
        expect(resp.data.productCode).toEqual(product.productCode);
        expect(resp.raw.metadata).toBeDefined();
      });
    });

    describe("GET /metadata", () => {
      it("should return product metadata", async () => {
        const resp = await productHttpClient.get(route, product.productCode);
        expect(resp.status).toBe(200);
        expect(resp.data.productCode).toEqual(product.productCode);
        expect(resp.raw.metadata).toBeDefined();
      });

      it("should reject request for invalid param", async () => {
        const resp = await productHttpClient.get(route, "11399113067865");
        expect(resp.status).toEqual(500);
        expect(resp.raw.error).toContain("Invalid product code!");
      });

      it("should reject request for invalid route", async () => {
        const resp = await productHttpClient.get(`${route}/`);
        // no matches any route
        expect(resp.status).toEqual(404);
      });
    });
  });
});
