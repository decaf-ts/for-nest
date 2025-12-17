import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DecafExceptionFilter, DecafModule } from "../../src";
import {
  Adapter,
  ModelService,
  query,
  RamAdapter,
  RamFlavour,
  service,
} from "@decaf-ts/core";
import { Product } from "./fakes/models/Product";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { OpenAPIObject } from "@nestjs/swagger/dist/interfaces/index";
import { Constructor } from "@decaf-ts/decoration";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

jest.setTimeout(180000);

export function getParams(arr: any[]) {
  return [...new Set(arr.filter((p) => p.required).map((p) => p.name))];
}

describe("DecafModelModule OpenAPI", () => {
  describe("From Repository", () => {
    let app: INestApplication;
    let openApi: OpenAPIObject;

    beforeAll(async () => {
      // Injectables.setRegistry(new InjectablesRegistry());
      Adapter._cache = {};

      const moduleRef = await Test.createTestingModule({
        imports: [
          DecafModule.forRootAsync({
            adapter: RamAdapter,
            conf: undefined,
            autoControllers: true,
            autoServices: false,
          }),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      const exceptions = [new DecafExceptionFilter()];
      app.useGlobalFilters(...exceptions);

      const swaggerConfig = new DocumentBuilder()
        .setTitle("Decaf API")
        .setDescription("API de testes")
        .setVersion("1.0")
        .build();

      openApi = SwaggerModule.createDocument(app, swaggerConfig);
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
    });

    it("should expose POST /product correctly", () => {
      const post = openApi.paths["/product"]?.post;
      expect(post).toBeDefined();
      expect(post.parameters.length).toEqual(0);
      expect(post.requestBody?.required).toBeTruthy();
      expect(Object.keys(post.responses)).toEqual(["201", "400", "422"]);
      expect(post.tags).toContain("Product");
    });

    it("should expose GET /product/{productCode}/{batchNumber} correctly", () => {
      const get = openApi.paths["/product/{productCode}/{batchNumber}"]?.get;

      expect(get).toBeDefined();
      expect(getParams(get.parameters)).toEqual(["productCode", "batchNumber"]);
      expect(Object.keys(get.responses)).toEqual(["200", "404"]);
      expect(get.tags).toContain("Product");
    });

    it("should expose PUT /product/{productCode}/{batchNumber} correctly", () => {
      const put = openApi.paths["/product/{productCode}/{batchNumber}"]?.put;

      expect(put).toBeDefined();
      expect(getParams(put.parameters)).toEqual(["productCode", "batchNumber"]);
      expect(put.requestBody?.required).toBeTruthy();
      expect(Object.keys(put.responses)).toEqual(["200", "400", "404"]);
      expect(put.tags).toContain("Product");
    });

    it("should expose DELETE /product/{productCode}/{batchNumber} correctly", () => {
      const del = openApi.paths["/product/{productCode}/{batchNumber}"]?.delete;

      expect(del).toBeDefined();
      expect(getParams(del.parameters)).toEqual(["productCode", "batchNumber"]);
      expect(Object.keys(del.responses)).toEqual(["200", "404"]);
      expect(del.tags).toContain("Product");
    });

    it("should expose custom statement endpoints correctly", () => {
      const byCountry =
        openApi.paths["/product/statement/findByCountry/{country}"]?.get;

      expect(byCountry).toBeDefined();
      expect(getParams(byCountry.parameters)).toEqual(["country"]);
      expect(Object.keys(byCountry.responses)).toEqual(["200", "204"]);
      expect(byCountry.tags).toContain("Product");

      const byAge =
        openApi.paths[
          "/product/statement/findByAgeGreaterThanAndAgeLessThan/{ageGreaterThan}/{ageLessThan}"
        ]?.get;

      expect(byAge).toBeDefined();
      expect(getParams(byAge.parameters)).toEqual([
        "ageGreaterThan",
        "ageLessThan",
      ]);
      expect(Object.keys(byAge.responses)).toEqual(["200", "204"]);
      expect(byAge.tags).toContain("Product");
    });
  });

  describe("From Service", () => {
    let app: INestApplication;
    let openApi: OpenAPIObject;

    @service("ProductService")
    class ProductService extends ModelService<Product> {
      constructor() {
        super(Product);
      }

      @query()
      async findByCountry(country: string) {
        throw new Error("Should be override by @query decorator");
      }

      @query()
      async findByAgeGreaterThanAndAgeLessThan(age1: number, age2: number) {
        throw new Error("Should be override by @query decorator");
      }
    }

    beforeAll(async () => {
      Adapter._cache = {};
      new ProductService();
      expect(ModelService.forModel(Product as Constructor)).toBeDefined();

      const moduleRef = await Test.createTestingModule({
        imports: [
          DecafModule.forRootAsync({
            adapter: RamAdapter,
            conf: undefined,
            autoControllers: true,
            autoServices: true,
          }),
        ],
      }).compile();

      app = moduleRef.createNestApplication();
      const exceptions = [new DecafExceptionFilter()];
      app.useGlobalFilters(...exceptions);

      const swaggerConfig = new DocumentBuilder()
        .setTitle("Decaf API")
        .setDescription("API de testes")
        .setVersion("1.0")
        .build();

      openApi = SwaggerModule.createDocument(app, swaggerConfig);
      await app.init();
    });

    afterAll(async () => {
      await app?.close();
      jest.clearAllMocks();
    });

    it("should expose POST /product correctly", () => {
      const post = openApi.paths["/product"]?.post;
      expect(post).toBeDefined();
      expect(post.parameters.length).toEqual(0);
      expect(post.requestBody?.required).toBeTruthy();
      expect(Object.keys(post.responses)).toEqual(["201", "400", "422"]);
      expect(post.tags).toContain("Product");
    });

    it("should expose GET /product/{productCode}/{batchNumber} correctly", () => {
      const get = openApi.paths["/product/{productCode}/{batchNumber}"]?.get;

      expect(get).toBeDefined();
      expect(getParams(get.parameters)).toEqual(["productCode", "batchNumber"]);
      expect(Object.keys(get.responses)).toEqual(["200", "404"]);
      expect(get.tags).toContain("Product");
    });

    it("should expose PUT /product/{productCode}/{batchNumber} correctly", () => {
      const put = openApi.paths["/product/{productCode}/{batchNumber}"]?.put;

      expect(put).toBeDefined();
      expect(getParams(put.parameters)).toEqual(["productCode", "batchNumber"]);
      expect(put.requestBody?.required).toBeTruthy();
      expect(Object.keys(put.responses)).toEqual(["200", "400", "404"]);
      expect(put.tags).toContain("Product");
    });

    it("should expose DELETE /product/{productCode}/{batchNumber} correctly", () => {
      const del = openApi.paths["/product/{productCode}/{batchNumber}"]?.delete;

      expect(del).toBeDefined();
      expect(getParams(del.parameters)).toEqual(["productCode", "batchNumber"]);
      expect(Object.keys(del.responses)).toEqual(["200", "404"]);
      expect(del.tags).toContain("Product");
    });

    it("should expose custom statement endpoints correctly", () => {
      const byCountry =
        openApi.paths["/product/statement/findByCountry/{country}"]?.get;

      expect(byCountry).toBeDefined();
      expect(getParams(byCountry.parameters)).toEqual(["country"]);
      expect(Object.keys(byCountry.responses)).toEqual(["200", "204"]);
      expect(byCountry.tags).toContain("Product");

      const byAge =
        openApi.paths[
          "/product/statement/findByAgeGreaterThanAndAgeLessThan/{ageGreaterThan}/{ageLessThan}"
        ]?.get;

      expect(byAge).toBeDefined();
      expect(getParams(byAge.parameters)).toEqual([
        "ageGreaterThan",
        "ageLessThan",
      ]);
      expect(Object.keys(byAge.responses)).toEqual(["200", "204"]);
      expect(byAge.tags).toContain("Product");
    });
  });
});
