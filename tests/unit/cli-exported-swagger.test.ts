import fs from "fs";
import path from "path";
import { Metadata } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { Product } from "./Product";
import jestOpenAPI from "jest-openapi";

const specPath = path.join(
  __dirname,
  "..",
  "..",
  "workdocs",
  "resources",
  "multi-level-swagger.json"
);

jestOpenAPI(specPath);

describe("CLI-exported Swagger spec", () => {
  let spec: any;
  const productProps = Metadata.properties(Product) ?? [];
  const nonGeneratedProductProps = productProps.filter(
    (prop) => !Model.generated(Product as any, prop as any)
  );
  const relationNames = new Set<string>(
    ((Model.relations(Product) as string[]) || []).filter(Boolean)
  );
  const expectedProductCreateProps = Array.from(
    new Set([...nonGeneratedProductProps, ...relationNames])
  );

  beforeAll(() => {
    if (!fs.existsSync(specPath)) {
      throw new Error(
        "Multi-level Swagger JSON not found. Run `WRITE_MULTI_SWAGGER=true npx jest --watchman=false --runInBand tests/unit/DtoFor.swagger.test.ts` to regenerate it."
      );
    }
    spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  });

  it("is a valid OpenAPI document", () => {
    const fakeResponse: any = {
      req: {
        method: "post",
        path: "/dto-for-test/create",
        headers: {},
        params: {},
        query: {},
      },
      status: 201,
      body: {},
      _json: {},
    };
    expect(fakeResponse).toSatisfyApiSpec();
  });

    it("MultiLevel CREATE DTO excludes generated fields", () => {
      const schema =
        spec.components?.schemas?.MultiLevelGeneratedModelCreateDTO;
      expect(schema).toBeDefined();
      const props = Object.keys(schema.properties || {});
      expect(props).toEqual(
        expect.arrayContaining(["multiName", "multiFlag"])
      );
    expect(props).not.toEqual(
      expect.arrayContaining([
        "version",
        "createdAt",
        "updatedAt",
        "createdBy",
        "updatedBy",
      ])
    );
  });

  it("MultiLevel UPDATE DTO excludes generated fields as well", () => {
    const schema =
      spec.components?.schemas?.MultiLevelGeneratedModelUpdateDTO;
    expect(schema).toBeDefined();
    const props = Object.keys(schema.properties || {});
    expect(props).not.toEqual(
      expect.arrayContaining([
        "version",
        "createdAt",
        "updatedAt",
        "createdBy",
        "updatedBy",
      ])
    );
  });

  describe("Product DTOs match DtoFor rules", () => {
    it("ProductCreateDTO excludes generated audit fields", () => {
      const schema = spec.components?.schemas?.ProductCreateDTO;
      expect(schema).toBeDefined();
      const props = Object.keys(schema.properties || {});
      expect(props).not.toEqual(
        expect.arrayContaining([
          "createdAt",
          "updatedAt",
          "createdBy",
          "updatedBy",
          "version",
        ])
      );
    });

    it("ProductCreateDTO matches the Product model properties", () => {
      const schema = spec.components?.schemas?.ProductCreateDTO;
      expect(schema).toBeDefined();
      const props = Object.keys(schema.properties || {});
      expect(props).toEqual(expect.arrayContaining(expectedProductCreateProps));
    });

    it("ProductUpdateDTO excludes generated audit fields", () => {
      const schema = spec.components?.schemas?.ProductUpdateDTO;
      expect(schema).toBeDefined();
      const props = Object.keys(schema.properties || {});
      expect(props).not.toEqual(
        expect.arrayContaining([
          "createdAt",
          "updatedAt",
          "createdBy",
          "updatedBy",
          "version",
        ])
      );
    });

    it("ProductUpdateDTO keeps primary key and relations", () => {
      const schema = spec.components?.schemas?.ProductUpdateDTO;
      expect(schema).toBeDefined();
      expect(schema.properties).toHaveProperty("productCode");
      const propNames = Object.keys(schema.properties || {});
      expect(propNames).toEqual(expect.arrayContaining(expectedProductCreateProps));
    });

    it("ProductCreateDTO exposes base scalars and relations", () => {
      const schema = spec.components?.schemas?.ProductCreateDTO;
      expect(schema).toBeDefined();
      const props = Object.keys(schema.properties || {});
      expect(props).toEqual(
        expect.arrayContaining([
          "productCode",
          "inventedName",
          "nameMedicinalProduct",
          "internalMaterialCode",
          "productRecall",
          "owner",
          "imageData",
          "strengths",
          "markets",
        ])
      );
      expect(schema.properties?.imageData?.["$ref"]).toBe(
        "#/components/schemas/ProductImageCreateDTO"
      );
      expect(
        schema.properties?.strengths?.items?.["$ref"]
      ).toBe("#/components/schemas/ProductStrengthCreateDTO");
      expect(
        schema.properties?.markets?.items?.["$ref"]
      ).toBe("#/components/schemas/ProductMarketCreateDTO");
    });

    it("ProductUpdateDTO allows key or DTO for relations", () => {
      const schema = spec.components?.schemas?.ProductUpdateDTO;
      expect(schema).toBeDefined();
      const updateImage = schema.properties?.imageData;
      const oneOf = updateImage?.oneOf ?? updateImage?.allOf;
      expect(Array.isArray(oneOf)).toBe(true);
      const hasDto = oneOf?.some(
        (entry: any) =>
          entry?.["$ref"] === "#/components/schemas/ProductImageUpdateDTO"
      );
      const hasKey = oneOf?.some((entry: any) => entry?.type);
      expect(hasDto).toBe(true);
      expect(hasKey).toBe(true);
    });
  });
});
