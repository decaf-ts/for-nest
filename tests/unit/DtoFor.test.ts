import "../../src/decoration";
import "../../src/overrides";

import { OperationKeys, version } from "@decaf-ts/db-decorators";
import { DtoFor } from "../../src/factory/openapi/DtoBuilder";
import { TestDtoModel } from "../e2e/fakes/models/TestDtoModel";
import { Product } from "./Product";
import { ProductStrength } from "./ProductStrength";
import { ProductMarket } from "./ProductMarket";
import { ProductImage } from "./ProductImage";
import {
  column,
  createdAt,
  createdBy,
  updatedAt,
  updatedBy,
  pk,
} from "@decaf-ts/core";
import { Model, model } from "@decaf-ts/decorator-validation";
import { Adapter } from "@decaf-ts/core";
import {
  RamAdapter,
  RamFlavour,
  // @ts-expect-error import from ram
} from "@decaf-ts/core/ram";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Returns the own property names declared on the DTO prototype (excl. constructor). */
function protoProps(dto: any): string[] {
  return Object.keys(Object.getOwnPropertyDescriptors(dto.prototype)).filter(
    (k) => k !== "constructor"
  );
}

/** Returns the Swagger API-property metadata stored on the DTO prototype. */
function apiMeta(dto: any, prop: string): any {
  return Reflect.getMetadata("swagger/apiModelProperties", dto.prototype, prop);
}

@model()
class DeepAuditRoot extends Model {
  @column()
  @version()
  version!: number;

  @column()
  @createdAt()
  createdAt!: Date;

  @column()
  @updatedAt()
  updatedAt!: Date;
}

@model()
class DeepOwnedModel extends DeepAuditRoot {
  @column()
  @createdBy()
  createdBy!: string;

  @column()
  @updatedBy()
  updatedBy!: string;
}

@model()
class MultiLevelGeneratedModel extends DeepOwnedModel {
  @pk()
  multiId!: string;

  @column()
  multiName!: string;

  @column()
  multiFlag?: boolean;
}

// ─── TestDtoModel – generated PK (String, generated: true) ───────────────────

describe("DtoFor – TestDtoModel (generated String pk)", () => {
  describe("CREATE", () => {
    let CreateDTO: any;
    beforeAll(() => {
      CreateDTO = DtoFor(OperationKeys.CREATE, TestDtoModel);
    });

    it("returns a class named TestDtoModelCreateDTO", () => {
      expect(CreateDTO.name).toBe("TestDtoModelCreateDTO");
    });

    it("excludes the generated PK (id)", () => {
      expect(protoProps(CreateDTO)).not.toContain("id");
    });

    it("excludes createdAt and updatedAt (generated timestamps)", () => {
      const props = protoProps(CreateDTO);
      expect(props).not.toContain("createdAt");
      expect(props).not.toContain("updatedAt");
    });

    it("includes all non-generated scalar properties", () => {
      const props = protoProps(CreateDTO);
      expect(props).toContain("simpleRequired");
      expect(props).toContain("requiredWithValidationBefore");
      expect(props).toContain("requiredWithValidationAfter");
      expect(props).toContain("requiredWithValidationAround");
      expect(props).toContain("optionalNoValidation");
      expect(props).toContain("optionalWithValidation");
    });

    it("marks @required() properties as required in Swagger metadata", () => {
      expect(apiMeta(CreateDTO, "simpleRequired")?.required).toBe(true);
      expect(apiMeta(CreateDTO, "requiredWithValidationBefore")?.required).toBe(
        true
      );
      expect(apiMeta(CreateDTO, "requiredWithValidationAfter")?.required).toBe(
        true
      );
      expect(apiMeta(CreateDTO, "requiredWithValidationAround")?.required).toBe(
        true
      );
    });

    it("marks optional properties as not required in Swagger metadata", () => {
      expect(apiMeta(CreateDTO, "optionalNoValidation")?.required).toBeFalsy();
      expect(
        apiMeta(CreateDTO, "optionalWithValidation")?.required
      ).toBeFalsy();
    });
  });

  describe("UPDATE", () => {
    let UpdateDTO: any;
    beforeAll(() => {
      UpdateDTO = DtoFor(OperationKeys.UPDATE, TestDtoModel);
    });

    it("returns a class named TestDtoModelUpdateDTO", () => {
      expect(UpdateDTO.name).toBe("TestDtoModelUpdateDTO");
    });

    it("includes the generated PK (id) for UPDATE", () => {
      expect(protoProps(UpdateDTO)).toContain("id");
    });

    it("excludes createdAt and updatedAt (generated timestamps)", () => {
      const props = protoProps(UpdateDTO);
      expect(props).not.toContain("createdAt");
      expect(props).not.toContain("updatedAt");
    });

    it("includes non-generated scalar properties", () => {
      const props = protoProps(UpdateDTO);
      expect(props).toContain("simpleRequired");
      expect(props).toContain("optionalNoValidation");
    });
  });

  describe("READ (not a transaction operation)", () => {
    it("returns the original model class unchanged", () => {
      expect(DtoFor(OperationKeys.READ, TestDtoModel)).toBe(TestDtoModel);
    });
  });

  describe("CREATE vs UPDATE", () => {
    it("produces distinct DTO classes", () => {
      const CreateDTO = DtoFor(OperationKeys.CREATE, TestDtoModel);
      const UpdateDTO = DtoFor(OperationKeys.UPDATE, TestDtoModel);
      expect(CreateDTO).not.toBe(UpdateDTO);
    });

    it("returns the same cached class on repeated calls", () => {
      expect(DtoFor(OperationKeys.CREATE, TestDtoModel)).toBe(
        DtoFor(OperationKeys.CREATE, TestDtoModel)
      );
      expect(DtoFor(OperationKeys.UPDATE, TestDtoModel)).toBe(
        DtoFor(OperationKeys.UPDATE, TestDtoModel)
      );
    });
  });
});

// ─── Product – non-generated String pk, with relations ───────────────────────

describe("DtoFor – Product (non-generated String pk, with relations)", () => {
  describe("CREATE", () => {
    let CreateDTO: any;
    beforeAll(() => {
      CreateDTO = DtoFor(OperationKeys.CREATE, Product);
    });

    it("returns a class named ProductCreateDTO", () => {
      expect(CreateDTO.name).toBe("ProductCreateDTO");
    });

    it("includes productCode (non-generated String pk) in CREATE", () => {
      expect(protoProps(CreateDTO)).toContain("productCode");
    });

    it("excludes all generated/ownership properties", () => {
      const props = protoProps(CreateDTO);
      expect(props).not.toContain("createdAt");
      expect(props).not.toContain("updatedAt");
      expect(props).not.toContain("createdBy");
      expect(props).not.toContain("updatedBy");
      expect(props).not.toContain("version");
    });

    it("includes non-generated scalar properties", () => {
      const props = protoProps(CreateDTO);
      expect(props).toContain("inventedName");
      expect(props).toContain("nameMedicinalProduct");
      expect(props).toContain("owner");
    });

    it("includes all relation properties (CREATE uses nested DTO)", () => {
      const props = protoProps(CreateDTO);
      expect(props).toContain("imageData");
      expect(props).toContain("strengths");
      expect(props).toContain("markets");
    });

    it("relation Swagger metadata uses the nested DTO type (no oneOf)", () => {
      const imageDataMeta = apiMeta(CreateDTO, "imageData");
      // CREATE relation must NOT have oneOf – it only accepts the full DTO
      expect(imageDataMeta?.oneOf).toBeUndefined();
      expect(imageDataMeta?.type).toBeDefined();
    });

    it("relation DTOs are named correctly for CREATE", () => {
      const imageMeta = apiMeta(CreateDTO, "imageData");
      const strengthsMeta = apiMeta(CreateDTO, "strengths");
      const marketsMeta = apiMeta(CreateDTO, "markets");
      expect(imageMeta?.type?.name).toBe("ProductImageCreateDTO");
      expect(strengthsMeta?.type?.name).toBe("ProductStrengthCreateDTO");
      expect(marketsMeta?.type?.name).toBe("ProductMarketCreateDTO");
    });
  });

  describe("UPDATE", () => {
    let UpdateDTO: any;
    beforeAll(() => {
      UpdateDTO = DtoFor(OperationKeys.UPDATE, Product);
    });

    it("returns a class named ProductUpdateDTO", () => {
      expect(UpdateDTO.name).toBe("ProductUpdateDTO");
    });

    it("includes productCode (pk) for UPDATE", () => {
      expect(protoProps(UpdateDTO)).toContain("productCode");
    });

    it("excludes generated properties", () => {
      const props = protoProps(UpdateDTO);
      expect(props).not.toContain("createdAt");
      expect(props).not.toContain("updatedAt");
      expect(props).not.toContain("createdBy");
      expect(props).not.toContain("updatedBy");
      expect(props).not.toContain("version");
    });

    it("includes relation properties", () => {
      const props = protoProps(UpdateDTO);
      expect(props).toContain("imageData");
      expect(props).toContain("strengths");
      expect(props).toContain("markets");
    });

    it("UPDATE relation metadata uses oneOf (DTO or PK)", () => {
      const imageDataMeta = apiMeta(UpdateDTO, "imageData");
      expect(Array.isArray(imageDataMeta?.oneOf)).toBe(true);
      expect(imageDataMeta.oneOf).toHaveLength(2);
    });

    it("oneOf includes ref to relation UpdateDTO", () => {
      const imageDataMeta = apiMeta(UpdateDTO, "imageData");
      const refs = imageDataMeta.oneOf.map((o: any) => o.$ref).filter(Boolean);
      expect(refs).toEqual(
        expect.arrayContaining(["#/components/schemas/ProductImageUpdateDTO"])
      );
    });

    it("oneOf includes a primitive type for the PK", () => {
      const imageDataMeta = apiMeta(UpdateDTO, "imageData");
      const primitives = imageDataMeta.oneOf
        .map((o: any) => o.type)
        .filter(Boolean);
      expect(primitives.length).toBeGreaterThan(0);
    });

    it("array relations also use oneOf", () => {
      const strengthsMeta = apiMeta(UpdateDTO, "strengths");
      expect(Array.isArray(strengthsMeta?.oneOf)).toBe(true);
    });
  });
});

// ─── ProductStrength – generated Number pk ───────────────────────────────────

describe("DtoFor – ProductStrength (generated Number pk)", () => {
  describe("CREATE", () => {
    let CreateDTO: any;
    beforeAll(() => {
      CreateDTO = DtoFor(OperationKeys.CREATE, ProductStrength);
    });

    it("excludes generated Number pk (id) from CREATE", () => {
      expect(protoProps(CreateDTO)).not.toContain("id");
    });

    it("includes non-generated scalar properties", () => {
      const props = protoProps(CreateDTO);
      expect(props).toContain("strength");
    });
  });

  describe("UPDATE", () => {
    let UpdateDTO: any;
    beforeAll(() => {
      UpdateDTO = DtoFor(OperationKeys.UPDATE, ProductStrength);
    });

    it("includes generated Number pk (id) in UPDATE", () => {
      expect(protoProps(UpdateDTO)).toContain("id");
    });
  });
});

// ─── ProductMarket – @composed pk (generated via @composed) ──────────────────

describe("DtoFor – ProductMarket (@composed pk, auto-generated)", () => {
  describe("CREATE", () => {
    let CreateDTO: any;
    beforeAll(() => {
      CreateDTO = DtoFor(OperationKeys.CREATE, ProductMarket);
    });

    it("excludes @composed pk (id) from CREATE", () => {
      // @composed sets @generated(), so even if @pk says generated: false the
      // @generated decorator still marks it as generated.
      expect(protoProps(CreateDTO)).not.toContain("id");
    });
  });

  describe("UPDATE", () => {
    let UpdateDTO: any;
    beforeAll(() => {
      UpdateDTO = DtoFor(OperationKeys.UPDATE, ProductMarket);
    });

    it("includes @composed pk (id) in UPDATE", () => {
      expect(protoProps(UpdateDTO)).toContain("id");
    });
  });
});

// ─── ProductImage – non-generated String pk ───────────────────────────────────

describe("DtoFor – ProductImage (non-generated String pk)", () => {
  describe("CREATE", () => {
    let CreateDTO: any;
    beforeAll(() => {
      CreateDTO = DtoFor(OperationKeys.CREATE, ProductImage);
    });

    it("includes non-generated String pk (productCode) in CREATE", () => {
      expect(protoProps(CreateDTO)).toContain("productCode");
    });

    it("includes required content property", () => {
      expect(protoProps(CreateDTO)).toContain("content");
    });
  });
});

describe("DtoFor – MultiLevelGeneratedModel (inherited generated metadata)", () => {
  let CreateDTO: any;
  let UpdateDTO: any;

  beforeAll(() => {
    CreateDTO = DtoFor(OperationKeys.CREATE, MultiLevelGeneratedModel);
    UpdateDTO = DtoFor(OperationKeys.UPDATE, MultiLevelGeneratedModel);
  });

  const generatedProps = [
    "version",
    "createdAt",
    "updatedAt",
    "createdBy",
    "updatedBy",
  ];

  it("omits inherited generated properties for CREATE", () => {
    const props = protoProps(CreateDTO);
    for (const generated of generatedProps) {
      expect(props).not.toContain(generated);
    }
  });

  it("omits inherited generated properties for UPDATE", () => {
    const props = protoProps(UpdateDTO);
    for (const generated of generatedProps) {
      expect(props).not.toContain(generated);
    }
  });

  it("includes its own non-generated scalars", () => {
    const props = protoProps(CreateDTO);
    expect(props).toContain("multiId");
    expect(props).toContain("multiName");
    expect(props).toContain("multiFlag");
  });

  it("includes the pk for UPDATE", () => {
    const props = protoProps(UpdateDTO);
    expect(props).toContain("multiId");
  });
});
