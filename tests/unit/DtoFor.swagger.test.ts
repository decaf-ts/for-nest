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
    const propertyNames = Object.keys(properties).sort();

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
    expect(properties).not.toHaveProperty("createdAt");
    expect(properties).not.toHaveProperty("updatedAt");
    expect(properties).not.toHaveProperty("updatedBy");
    expect(properties).not.toHaveProperty("createdBy");
    expect(properties).not.toHaveProperty("version");

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
});
