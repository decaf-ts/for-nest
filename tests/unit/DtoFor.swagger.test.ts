import "../../src/decoration";
import "../../src/overrides";

import {
  Body,
  Controller,
  INestApplication,
  Module,
  Post,
} from "@nestjs/common";
import { ApiBody, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { NestFactory } from "@nestjs/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Adapter } from "@decaf-ts/core";
import {
  RamAdapter,
  RamFlavour,
  // @ts-expect-error import from ram
} from "@decaf-ts/core/ram";
import { DtoFor } from "../../src/factory/openapi/DtoBuilder";
import { Product } from "./Product";

jest.setTimeout(30000);

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

const CreateDTO = DtoFor(OperationKeys.CREATE, Product);

@Controller("dto-for-test")
class TestDtoController {
  @Post("create")
  @ApiBody({ type: CreateDTO })
  create(@Body() body: InstanceType<typeof CreateDTO>) {
    return body;
  }
}

@Module({
  controllers: [TestDtoController],
})
class DtoSwaggerModule {}

describe("DtoFor Swagger output", () => {
  let app: INestApplication;
  let document: any;

  beforeAll(async () => {
    app = await NestFactory.create(DtoSwaggerModule, { logger: false });
    const config = new DocumentBuilder()
      .setTitle("DtoFor Swagger")
      .setDescription("Create DTO swagger extraction test")
      .setVersion("1.0")
      .build();

    await app.init();
    document = SwaggerModule.createDocument(app, config);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("should omit generated props and only require decorated fields", () => {
    const schema = document.components?.schemas?.[CreateDTO.name];
    expect(schema).toBeDefined();

    const properties = schema.properties || {};
    const propertyNames = [...collectSchemaPropertyNames(schema, document)].sort();

    const expectedProperties = [
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
    expect(propertyNames).toEqual(expectedProperties);
    expect(properties).toHaveProperty("productCode");
    expect(propertyNames).not.toContain("createdAt");
    expect(propertyNames).not.toContain("updatedAt");
    expect(propertyNames).not.toContain("updatedBy");
    expect(propertyNames).not.toContain("createdBy");
    expect(propertyNames).not.toContain("version");
    expect(properties.productRecall?.type).toBe("boolean");

    const required = [...(schema.required ?? [])].sort();
    const expectedRequired = [
      "productCode",
      "inventedName",
      "nameMedicinalProduct",
    ].sort();
    expect(required).toEqual(expectedRequired);

    const imageDataRef =
      properties.imageData?.allOf?.[0]?.["$ref"] ?? properties.imageData?.["$ref"];
    const strengthsRef =
      properties.strengths?.items?.["$ref"] ?? properties.strengths?.items?.type;
    const marketsRef =
      properties.markets?.items?.["$ref"] ?? properties.markets?.items?.type;

    expect(imageDataRef).toBe("#/components/schemas/ProductImageCreateDTO");
    expect(strengthsRef).toBe("#/components/schemas/ProductStrengthCreateDTO");
    expect(marketsRef).toBe("#/components/schemas/ProductMarketCreateDTO");
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

  it("should keep the primary key in the UPDATE DTO while still excluding generated fields", () => {
    const UpdateDTO = DtoFor(OperationKeys.UPDATE, Product);
    expect(UpdateDTO).toBeDefined();

    const protoProps = Object.keys(
      Object.getOwnPropertyDescriptors(UpdateDTO.prototype)
    ).filter((prop) => prop !== "constructor");

    expect(protoProps).toContain("productCode");
    expect(protoProps).not.toContain("createdAt");
    expect(protoProps).not.toContain("updatedAt");
    expect(protoProps).not.toContain("version");
  });
});

function collectSchemaPropertyNames(
  schema: any,
  document: any,
  visited: Set<string> = new Set()
) {
  if (!schema) {
    return new Set<string>();
  }
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
