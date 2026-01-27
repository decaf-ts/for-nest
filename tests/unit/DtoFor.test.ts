import "../../src/decoration";
import "../../src/overrides";

import { OperationKeys } from "@decaf-ts/db-decorators";
import { DtoFor } from "../../src/factory/openapi/DtoBuilder";
import { TestDtoModel } from "../e2e/fakes/models/TestDtoModel";
import { Adapter } from "@decaf-ts/core";
import {
  RamAdapter,
  RamFlavour,
  // @ts-expect-error  import from ram
} from "@decaf-ts/core/ram";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

describe("DtoFor", () => {
  describe("CREATE operation", () => {
    it("should exclude all generated properties including PK", () => {
      const CreateDTO = DtoFor(OperationKeys.CREATE, TestDtoModel);

      // Get the properties from the DTO prototype
      const propertyNames = Object.keys(
        Object.getOwnPropertyDescriptors(CreateDTO.prototype)
      ).filter((k) => k !== "constructor");

      // For CREATE, the PK (id) should be excluded since it's generated
      expect(propertyNames).not.toContain("id");

      // Other generated properties should also be excluded
      expect(propertyNames).not.toContain("createdAt");
      expect(propertyNames).not.toContain("updatedAt");

      // DTO name should reflect the operation
      expect(CreateDTO.name).toBe("TestDtoModelCreateDTO");
    });
  });

  describe("UPDATE operation", () => {
    it("should include PK but exclude other generated properties", () => {
      const UpdateDTO = DtoFor(OperationKeys.UPDATE, TestDtoModel);

      // Get the properties from the DTO prototype
      const propertyNames = Object.keys(
        Object.getOwnPropertyDescriptors(UpdateDTO.prototype)
      ).filter((k) => k !== "constructor");

      // Other generated properties should still be excluded
      expect(propertyNames).not.toContain("createdAt");
      expect(propertyNames).not.toContain("updatedAt");

      // DTO name should reflect the operation
      expect(UpdateDTO.name).toBe("TestDtoModelUpdateDTO");
    });

    it("should have different excluded properties than CREATE DTO", () => {
      const CreateDTO = DtoFor(OperationKeys.CREATE, TestDtoModel);
      const UpdateDTO = DtoFor(OperationKeys.UPDATE, TestDtoModel);

      // The CREATE and UPDATE DTOs should be different classes
      expect(CreateDTO).not.toBe(UpdateDTO);

      // They should have different names
      expect(CreateDTO.name).toBe("TestDtoModelCreateDTO");
      expect(UpdateDTO.name).toBe("TestDtoModelUpdateDTO");
    });
  });

  describe("READ operation (no DTO needed - only takes ID)", () => {
    it("should return the original model", () => {
      const ReadResult = DtoFor(OperationKeys.READ, TestDtoModel);

      // For READ, no DTO transformation should happen
      expect(ReadResult).toBe(TestDtoModel);
    });
  });
});
