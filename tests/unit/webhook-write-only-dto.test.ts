import "../../src/decoration";
import "../../src/overrides";

import { OperationKeys } from "@decaf-ts/db-decorators";
import { Adapter } from "@decaf-ts/core";
import {
  RamAdapter,
  RamFlavour,
  // @ts-expect-error import from ram
} from "@decaf-ts/core/ram";
import {
  WebhookDelivery,
  WebhookSubscription,
  writeOnly,
} from "@decaf-ts/for-http/hooks";
import { DtoFor } from "../../src/factory/openapi/DtoBuilder";
import { writeOnlyFieldsOf } from "../../src/decaf-model/scoping";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

// ─── helpers (same convention as DtoFor.test.ts) ─────────────────────────────

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

describe("WebhookSubscription secret is write-only", () => {
  describe("@writeOnly() metadata registration", () => {
    it("marks the secret property as write-only on WebhookSubscription", () => {
      expect(writeOnlyFieldsOf(WebhookSubscription)).toContain("secret");
    });

    it("marks the secret property as write-only on WebhookDelivery", () => {
      expect(writeOnlyFieldsOf(WebhookDelivery)).toContain("secret");
    });
  });

  describe("DtoFor(CREATE, WebhookSubscription)", () => {
    let CreateDTO: any;
    beforeAll(() => {
      CreateDTO = DtoFor(OperationKeys.CREATE, WebhookSubscription);
    });

    it("returns a class named WebhookSubscriptionCreateDTO", () => {
      expect(CreateDTO.name).toBe("WebhookSubscriptionCreateDTO");
    });

    it("keeps secret in the CREATE DTO (client may provide it)", () => {
      expect(protoProps(CreateDTO)).toContain("secret");
    });

    it("keeps secret marked via swagger api metadata", () => {
      expect(apiMeta(CreateDTO, "secret")).toBeDefined();
    });

    it("keeps owner and the core scalar fields in CREATE", () => {
      const props = protoProps(CreateDTO);
      expect(props).toContain("topic");
      expect(props).toContain("url");
      expect(props).toContain("active");
      expect(props).toContain("owner");
    });
  });

  describe("DtoFor(UPDATE, WebhookSubscription)", () => {
    let UpdateDTO: any;
    beforeAll(() => {
      UpdateDTO = DtoFor(OperationKeys.UPDATE, WebhookSubscription);
    });

    it("returns a class named WebhookSubscriptionUpdateDTO", () => {
      expect(UpdateDTO.name).toBe("WebhookSubscriptionUpdateDTO");
    });

    it("excludes secret from the UPDATE DTO (write-only)", () => {
      expect(protoProps(UpdateDTO)).not.toContain("secret");
    });

    it("still exposes non-write-only fields in UPDATE", () => {
      const props = protoProps(UpdateDTO);
      expect(props).toContain("topic");
      expect(props).toContain("url");
      expect(props).toContain("active");
      expect(props).toContain("owner");
    });

    it("includes the pk id in UPDATE", () => {
      expect(protoProps(UpdateDTO)).toContain("id");
    });
  });

  describe("WebhookDelivery DTOs", () => {
    it("keeps secret in CREATE but excludes it from UPDATE for WebhookDelivery", () => {
      const createProps = protoProps(
        DtoFor(OperationKeys.CREATE, WebhookDelivery)
      );
      const updateProps = protoProps(
        DtoFor(OperationKeys.UPDATE, WebhookDelivery)
      );
      expect(createProps).toContain("secret");
      expect(updateProps).not.toContain("secret");
    });
  });

  describe("writeOnly decorator", () => {
    it("writeOnly is a PropertyDecorator factory returning a function", () => {
      expect(typeof writeOnly).toBe("function");
      const decorator = writeOnly();
      expect(typeof decorator).toBe("function");
    });
  });
});
