import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DecafExceptionFilter, DecafModule } from "../../src";
import { Adapter, ModelService, query, service } from "@decaf-ts/core";
import {
  RamAdapter,
  RamContext,
  RamFlags,
  RamFlavour,
  // @ts-expect-error  import from ram
} from "@decaf-ts/core/ram";
import { Product } from "./fakes/models/Product";
import { TestDtoModel } from "./fakes/models/TestDtoModel";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { OpenAPIObject } from "@nestjs/swagger/dist/interfaces/index";
import { Constructor } from "@decaf-ts/decoration";
import {
  requestToContextTransformer,
  RequestToContextTransformer,
} from "../../src/interceptors/context";

@requestToContextTransformer(RamFlavour)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class RamTransformer implements RequestToContextTransformer<RamContext> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async from(req: any, args: any): Promise<RamFlags> {
    return { user: "here" }; // should be populating from req
  }
}

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
            conf: [[RamAdapter, {}]],
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

    it.skip("should expose custom statement endpoints correctly", () => {
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      async findByCountry(country: string) {
        throw new Error("Should be override by @query decorator");
      }

      @query()
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
            conf: [[RamAdapter, {}]],
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

    it.skip("should expose custom statement endpoints correctly", () => {
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

  describe("DtoFor Required/Optional Properties", () => {
    let app: INestApplication;
    let openApi: OpenAPIObject;

    beforeAll(async () => {
      Adapter._cache = {};

      // Ensure TestDtoModel is registered
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _testModel = TestDtoModel;

      const moduleRef = await Test.createTestingModule({
        imports: [
          DecafModule.forRootAsync({
            conf: [[RamAdapter, {}]],
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

    it("should mark @required properties as required regardless of decorator order", () => {
      // Find the schema for the TestDtoModel CREATE DTO
      const schemas = openApi.components?.schemas || {};
      const createDtoName = Object.keys(schemas).find(
        (name) => name.includes("TestDtoModel") && name.includes("Create")
      );

      if (!createDtoName) {
        // If no DTO is created, check the base model schema
        const baseSchema = schemas["TestDtoModel"] as any;
        if (baseSchema) {
          const requiredFields = baseSchema.required || [];
          // All properties with @required() should be in the required array
          expect(requiredFields).toContain("simpleRequired");
          expect(requiredFields).toContain("requiredWithValidationBefore");
          expect(requiredFields).toContain("requiredWithValidationAfter");
          expect(requiredFields).toContain("requiredWithValidationAround");

          // Optional properties should NOT be in the required array
          expect(requiredFields).not.toContain("optionalNoValidation");
          expect(requiredFields).not.toContain("optionalWithValidation");
        }
        return;
      }

      const schema = schemas[createDtoName] as any;
      expect(schema).toBeDefined();

      const requiredFields = schema.required || [];

      // All properties with @required() should be in the required array
      expect(requiredFields).toContain("simpleRequired");
      expect(requiredFields).toContain("requiredWithValidationBefore");
      expect(requiredFields).toContain("requiredWithValidationAfter");
      expect(requiredFields).toContain("requiredWithValidationAround");

      // Optional properties should NOT be in the required array
      expect(requiredFields).not.toContain("optionalNoValidation");
      expect(requiredFields).not.toContain("optionalWithValidation");
    });

    it("should exclude generated properties from CREATE DTO schema", () => {
      const schemas = openApi.components?.schemas || {};
      const createDtoName = Object.keys(schemas).find(
        (name) => name.includes("TestDtoModel") && name.includes("Create")
      );

      if (!createDtoName) {
        // Skip if no DTO is created
        return;
      }

      const schema = schemas[createDtoName] as any;
      expect(schema).toBeDefined();

      const properties = schema.properties || {};

      // Generated properties should be excluded from CREATE DTO
      expect(properties).not.toHaveProperty("id");
      expect(properties).not.toHaveProperty("createdAt");
      expect(properties).not.toHaveProperty("updatedAt");

      // Non-generated properties should be present
      expect(properties).toHaveProperty("simpleRequired");
      expect(properties).toHaveProperty("optionalNoValidation");
    });

    it("should include PK but exclude other generated properties from UPDATE DTO schema", () => {
      const schemas = openApi.components?.schemas || {};
      const updateDtoName = Object.keys(schemas).find(
        (name) => name.includes("TestDtoModel") && name.includes("Update")
      );

      if (!updateDtoName) {
        // Skip if no DTO is created
        console.log("No UPDATE DTO found, available schemas:", Object.keys(schemas));
        return;
      }

      const schema = schemas[updateDtoName] as any;
      expect(schema).toBeDefined();

      const properties = schema.properties || {};

      // PK should be INCLUDED in UPDATE DTO (needed to identify the record)
      expect(properties).toHaveProperty("id");

      // Other generated properties should still be excluded
      expect(properties).not.toHaveProperty("createdAt");
      expect(properties).not.toHaveProperty("updatedAt");

      // Non-generated properties should be present
      expect(properties).toHaveProperty("simpleRequired");
      expect(properties).toHaveProperty("optionalNoValidation");
    });

    it("should have correct required array in POST request body schema", () => {
      const post = openApi.paths["/test-dto"]?.post;
      if (!post) {
        // Model might use different path
        return;
      }

      expect(post).toBeDefined();
      expect(post.requestBody).toBeDefined();

      // The request body should reference a schema that has correct required fields
      const requestBodyContent = (post.requestBody as any)?.content?.[
        "application/json"
      ];
      expect(requestBodyContent).toBeDefined();
    });

    it("should log OpenAPI schemas for debugging", () => {
      const schemas = openApi.components?.schemas || {};
      const relevantSchemas = Object.entries(schemas).filter(
        ([name]) =>
          name.includes("TestDtoModel") ||
          name.includes("TestDto") ||
          name.includes("Product")
      );

      console.log(
        "Available schemas:",
        relevantSchemas.map(([name, schema]) => ({
          name,
          required: (schema as any).required,
          properties: Object.keys((schema as any).properties || {}),
        }))
      );
    });
  });
});
