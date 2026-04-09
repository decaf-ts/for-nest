import "reflect-metadata";
import { ModelBuilder } from "@decaf-ts/decorator-validation";
import { AUTH_META_KEY } from "../../src/constants";
import "../../src/overrides/ModelBuilderExtensions";

describe("for-nest ModelBuilder extensions", () => {
  it("attaches Auth metadata through builder helpers", () => {
    const builder = ModelBuilder.builder();
    builder.setName("AuthBuilderModel");
    builder.Auth("ResourceName");

    const Dynamic = builder.build();

    expect(Reflect.getMetadata(AUTH_META_KEY, Dynamic)).toEqual("ResourceName");
  });
});
