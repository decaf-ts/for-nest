import "../../src/decoration";
import "../../src/overrides";

import fs from "fs";
import path from "path";
import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { NestFactory } from "@nestjs/core";
import {
  CreateDTO,
  DtoSwaggerModule,
  MultiLevelCreateDTO,
  MultiLevelUpdateDTO,
  UpdateDTO,
} from "./dto-swagger-app";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively collects all property names from a schema, following allOf refs
 * for inheritance-based schemas.
 */
function collectSchemaPropertyNames(
  schema: any,
  document: any,
  visited: Set<string> = new Set()
): Set<string> {
  if (!schema) return new Set<string>();

  const properties = new Set(Object.keys(schema.properties || {}));

  for (const entry of schema.allOf ?? []) {
    const ref = entry?.["$ref"];
    if (!ref?.startsWith("#/components/schemas/")) continue;
    const schemaName = ref.split("#/components/schemas/")[1];
    if (!schemaName || visited.has(schemaName)) continue;
    visited.add(schemaName);
    const nestedSchema = document.components?.schemas?.[schemaName];
    if (!nestedSchema) continue;
    for (const nestedProp of collectSchemaPropertyNames(
      nestedSchema,
      document,
      visited
    )) {
      properties.add(nestedProp);
    }
  }

  return properties;
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("DtoFor Swagger output", () => {
  let app: INestApplication;
  let document: any;

  beforeAll(async () => {
    app = await NestFactory.create(DtoSwaggerModule, { logger: false });
    const config = new DocumentBuilder()
      .setTitle("DtoFor Swagger")
      .setDescription("DtoFor swagger extraction tests")
      .setVersion("1.0")
      .build();

    await app.init();
    document = SwaggerModule.createDocument(app, config);
    if (process.env.WRITE_MULTI_SWAGGER === "true") {
      const outDir = path.resolve("workdocs/resources");
      fs.mkdirSync(outDir, { recursive: true });
      const filePath = path.join(outDir, "multi-level-swagger.json");
      fs.writeFileSync(filePath, JSON.stringify(document, null, 2), "utf8");
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ── CREATE DTO ──────────────────────────────────────────────────────────────

  describe("CREATE DTO (ProductCreateDTO)", () => {
    let schema: any;
    let propertyNames: string[];

    beforeAll(() => {
      schema = document.components?.schemas?.[CreateDTO.name];
      propertyNames = [
        ...collectSchemaPropertyNames(schema, document),
      ].sort();
    });

    it("schema is present in swagger document", () => {
      expect(schema).toBeDefined();
    });

    it("exposes exactly the expected properties", () => {
      const expected = [
        "imageData",
        "internalMaterialCode",
        "inventedName",
        "markets",
        "nameMedicinalProduct",
        "owner",
        "productCode",
        "productRecall",
        "strengths",
      ].sort();
      expect(propertyNames).toEqual(expected);
    });

    it("includes productCode (non-generated String pk) for CREATE", () => {
      expect(schema.properties).toHaveProperty("productCode");
    });

    it("excludes all generated fields", () => {
      expect(propertyNames).not.toContain("createdAt");
      expect(propertyNames).not.toContain("updatedAt");
      expect(propertyNames).not.toContain("createdBy");
      expect(propertyNames).not.toContain("updatedBy");
      expect(propertyNames).not.toContain("version");
    });

    it("marks required fields correctly", () => {
      const required = [...(schema.required ?? [])].sort();
      const expectedRequired = [
        "productCode",
        "inventedName",
        "nameMedicinalProduct",
      ].sort();
      expect(required).toEqual(expectedRequired);
    });

    it("productRecall has boolean type", () => {
      expect(schema.properties?.productRecall?.type).toBe("boolean");
    });

    it("imageData references ProductImageCreateDTO", () => {
      const imageProp = schema.properties?.imageData;
      const ref =
        imageProp?.allOf?.[0]?.["$ref"] ?? imageProp?.["$ref"];
      expect(ref).toBe("#/components/schemas/ProductImageCreateDTO");
    });

    it("strengths references ProductStrengthCreateDTO (array)", () => {
      const ref =
        schema.properties?.strengths?.items?.["$ref"] ??
        schema.properties?.strengths?.items?.type;
      expect(ref).toBe("#/components/schemas/ProductStrengthCreateDTO");
    });

    it("markets references ProductMarketCreateDTO (array)", () => {
      const ref =
        schema.properties?.markets?.items?.["$ref"] ??
        schema.properties?.markets?.items?.type;
      expect(ref).toBe("#/components/schemas/ProductMarketCreateDTO");
    });

    it("nested relation schemas are registered in swagger document", () => {
      expect(
        document.components?.schemas?.ProductImageCreateDTO
      ).toBeDefined();
      expect(
        document.components?.schemas?.ProductStrengthCreateDTO
      ).toBeDefined();
      expect(
        document.components?.schemas?.ProductMarketCreateDTO
      ).toBeDefined();
    });

    it("nested CREATE DTOs exclude generated ids from their own models", () => {
      // ProductStrength has a generated Number pk (id) – must be absent from its CREATE DTO
      const strengthSchema =
        document.components?.schemas?.ProductStrengthCreateDTO;
      expect(strengthSchema).toBeDefined();
      const strengthProps = Object.keys(strengthSchema?.properties || {});
      expect(strengthProps).not.toContain("id");
      expect(strengthProps).toContain("strength");

      // ProductMarket has a @composed pk (id) – must be absent from its CREATE DTO
      const marketSchema =
        document.components?.schemas?.ProductMarketCreateDTO;
      expect(marketSchema).toBeDefined();
      const marketProps = Object.keys(marketSchema?.properties || {});
      expect(marketProps).not.toContain("id");
      expect(marketProps).toContain("marketId");

      // ProductImage has a non-generated String pk (productCode) – MUST be present
      const imageSchema =
        document.components?.schemas?.ProductImageCreateDTO;
      expect(imageSchema).toBeDefined();
      const imageProps = Object.keys(imageSchema?.properties || {});
      expect(imageProps).toContain("productCode");
    });
  });

  // ── UPDATE DTO ──────────────────────────────────────────────────────────────

  describe("UPDATE DTO (ProductUpdateDTO)", () => {
    let schema: any;
    let propertyNames: string[];

    beforeAll(() => {
      schema = document.components?.schemas?.[UpdateDTO.name];
      propertyNames = [
        ...collectSchemaPropertyNames(schema, document),
      ].sort();
    });

    it("schema is present in swagger document", () => {
      expect(schema).toBeDefined();
    });

    it("includes productCode (pk) for UPDATE", () => {
      expect(schema.properties).toHaveProperty("productCode");
    });

    it("excludes generated fields", () => {
      expect(propertyNames).not.toContain("createdAt");
      expect(propertyNames).not.toContain("updatedAt");
      expect(propertyNames).not.toContain("createdBy");
      expect(propertyNames).not.toContain("updatedBy");
      expect(propertyNames).not.toContain("version");
    });

    it("includes relation properties", () => {
      expect(schema.properties).toHaveProperty("imageData");
      expect(schema.properties).toHaveProperty("strengths");
      expect(schema.properties).toHaveProperty("markets");
    });

    it("imageData UPDATE relation exposes oneOf (DTO or PK string)", () => {
      const imageProp = schema.properties?.imageData;
      // NestJS Swagger may output oneOf directly or wrap it
      const oneOf = imageProp?.oneOf ?? imageProp?.allOf;
      expect(Array.isArray(oneOf)).toBe(true);
      const hasRef = oneOf.some(
        (o: any) => o.$ref === "#/components/schemas/ProductImageUpdateDTO"
      );
      const hasPrimitive = oneOf.some(
        (o: any) => o.type === "string" || o.type === "integer"
      );
      expect(hasRef).toBe(true);
      expect(hasPrimitive).toBe(true);
    });

    it("strengths UPDATE relation exposes oneOf inside items (array)", () => {
      const strengthsProp = schema.properties?.strengths;
      // Array of oneOf: items.oneOf expected
      const itemsOneOf = strengthsProp?.items?.oneOf;
      expect(Array.isArray(itemsOneOf)).toBe(true);
      const hasRef = itemsOneOf.some(
        (o: any) =>
          o.$ref === "#/components/schemas/ProductStrengthUpdateDTO"
      );
      const hasPrimitive = itemsOneOf.some(
        (o: any) => o.type === "string" || o.type === "integer"
      );
      expect(hasRef).toBe(true);
      expect(hasPrimitive).toBe(true);
    });

    it("UPDATE relation DTOs are registered as extra models", () => {
      expect(
        document.components?.schemas?.ProductImageUpdateDTO
      ).toBeDefined();
      expect(
        document.components?.schemas?.ProductStrengthUpdateDTO
      ).toBeDefined();
      expect(
        document.components?.schemas?.ProductMarketUpdateDTO
      ).toBeDefined();
    });

    it("nested UPDATE DTOs include their generated PKs", () => {
      // ProductStrength has generated Number pk (id) – must be present in UPDATE DTO
      const strengthSchema =
        document.components?.schemas?.ProductStrengthUpdateDTO;
      expect(strengthSchema).toBeDefined();
      const strengthProps = Object.keys(strengthSchema?.properties || {});
      expect(strengthProps).toContain("id");

      // ProductImage has non-generated String pk (productCode) – also present
      const imageSchema =
        document.components?.schemas?.ProductImageUpdateDTO;
      expect(imageSchema).toBeDefined();
      const imageProps = Object.keys(imageSchema?.properties || {});
      expect(imageProps).toContain("productCode");
    });
  });

  describe("MultiLevelGeneratedModel schema", () => {
    let schema: any;
    let propertyNames: string[];
    let updateSchema: any;

    beforeAll(() => {
      schema = document.components?.schemas?.[MultiLevelCreateDTO.name];
      updateSchema = document.components?.schemas?.[MultiLevelUpdateDTO.name];
      propertyNames = [
        ...collectSchemaPropertyNames(schema, document),
      ].sort();
    });

    it("defines the MultiLevel CREATE DTO schema", () => {
      expect(schema).toBeDefined();
    });

    it("only exposes the multi-level scalars", () => {
      expect(propertyNames).toEqual(["multiFlag", "multiId", "multiName"].sort());
    });

    it("does not expose inherited generated fields", () => {
      expect(propertyNames).not.toContain("version");
      expect(propertyNames).not.toContain("createdAt");
      expect(propertyNames).not.toContain("updatedAt");
      expect(propertyNames).not.toContain("createdBy");
      expect(propertyNames).not.toContain("updatedBy");
    });

    it("UPDATE schema keeps generated fields excluded as well", () => {
      const updateProperties = [
        ...collectSchemaPropertyNames(updateSchema, document),
      ];
      expect(updateProperties).not.toContain("version");
      expect(updateProperties).not.toContain("createdAt");
      expect(updateProperties).not.toContain("updatedAt");
      expect(updateProperties).not.toContain("createdBy");
      expect(updateProperties).not.toContain("updatedBy");
    });
  });
});
