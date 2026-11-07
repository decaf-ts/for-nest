import "reflect-metadata";
import { it } from "@decaf-ts/for-testing";
import {
  createClassDecorator,
  createMethodDecorator,
  createMixedDecorator,
  createParamDecorator,
  createPropertyDecorator,
  getTypeIsArrayTuple,
  isConstructor,
  METHOD_METADATA,
  METADATA_FACTORY_NAME,
} from "../../src/overrides/helpers";
import { DECORATORS } from "../../src/overrides/constants";

describe("override decorator helpers", () => {
  it("detects the constructor name", () => {
    expect(isConstructor("constructor")).toBe(true);
    expect(isConstructor("method")).toBe(false);
  });

  it("merges method metadata and honors overrideExisting", () => {
    class Example { run() {} }
    const descriptor = Object.getOwnPropertyDescriptor(Example.prototype, "run")!;
    createMethodDecorator("method-metadata", { first: true })(Example.prototype, "run", descriptor);
    createMethodDecorator("method-metadata", { second: true })(Example.prototype, "run", descriptor);
    expect(Reflect.getMetadata("method-metadata", descriptor.value)).toEqual({ first: true, second: true });
    createMethodDecorator("method-metadata", { third: true }, { overrideExisting: false })(Example.prototype, "run", descriptor);
    expect(Reflect.getMetadata("method-metadata", descriptor.value)).toEqual({ first: true, second: true });
    createMethodDecorator("scalar-metadata", "value")(Example.prototype, "run", descriptor);
    expect(Reflect.getMetadata("scalar-metadata", descriptor.value)).toBe("value");
  });

  it("appends class metadata", () => {
    class Example {}
    createClassDecorator("class-metadata", ["one"])(Example);
    createClassDecorator("class-metadata", ["two"])(Example);
    expect(Reflect.getMetadata("class-metadata", Example)).toEqual(["one", "two"]);
  });

  it("adds property metadata from the model factory or design metadata", () => {
    class Example {
      static [METADATA_FACTORY_NAME]() { return { fromFactory: { type: Number } }; }
      fromFactory!: number;
      fromDesign!: string;
    }
    createPropertyDecorator("property-metadata", { required: true })(Example.prototype, "fromFactory");
    Reflect.defineMetadata("design:type", String, Example.prototype, "fromDesign");
    createPropertyDecorator("property-metadata", { description: "design" })(Example.prototype, "fromDesign");
    expect(Reflect.getMetadata("property-metadata", Example.prototype, "fromFactory")).toEqual({ type: Number, required: true });
    expect(Reflect.getMetadata("property-metadata", Example.prototype, "fromDesign")).toEqual({ type: String, description: "design" });
    expect(Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, Example.prototype)).toEqual([":fromFactory", ":fromDesign"]);
  });

  it("merges existing property metadata in either precedence mode", () => {
    class Example { value!: string; }
    Reflect.defineMetadata("property-metadata", { old: true, value: "old" }, Example.prototype, "value");
    createPropertyDecorator("property-metadata", { value: "new", added: true })(Example.prototype, "value");
    expect(Reflect.getMetadata("property-metadata", Example.prototype, "value")).toEqual({ old: true, value: "new", added: true });
    createPropertyDecorator("property-metadata", { value: "latest" }, false)(Example.prototype, "value");
    expect(Reflect.getMetadata("property-metadata", Example.prototype, "value")).toEqual({ value: "new", added: true, old: true });
  });

  it("applies mixed metadata to methods and classes", () => {
    class Example { run() {} }
    const descriptor = Object.getOwnPropertyDescriptor(Example.prototype, "run")!;
    createMixedDecorator("mixed-method", { first: true })(Example.prototype, "run", descriptor);
    createMixedDecorator("mixed-method", { second: true })(Example.prototype, "run", descriptor);
    expect(Reflect.getMetadata("mixed-method", descriptor.value)).toEqual({ first: true, second: true });
    createMixedDecorator("mixed-class", ["one"])(Example);
    createMixedDecorator("mixed-class", ["two"])(Example);
    expect(Reflect.getMetadata("mixed-class", Example)).toEqual(["one", "two"]);
  });

  it("applies parameter metadata to methods and decorated API methods", () => {
    class Example {
      run() {}
      untouched() {}
    }
    const descriptor = Object.getOwnPropertyDescriptor(Example.prototype, "run")!;
    createParamDecorator({ name: "id", description: undefined }, { in: "path" })(Example.prototype, "run", descriptor);
    expect(Reflect.getMetadata(DECORATORS.API_PARAMETERS, descriptor.value)).toEqual([{ in: "path", name: "id" }]);
    Reflect.defineMetadata(METHOD_METADATA, true, descriptor.value);
    createParamDecorator({ name: "query" }, { in: "query" })(Example);
    expect(Reflect.getMetadata(DECORATORS.API_PARAMETERS, descriptor.value)).toEqual([
      { in: "path", name: "id" },
      { in: "query", name: "query" },
    ]);
    expect(Reflect.getMetadata(DECORATORS.API_PARAMETERS, Example.prototype.untouched)).toBeUndefined();
    const instance = {};
    expect(createParamDecorator({}, {})(instance as any)).toBe(instance);
  });

  it("normalizes array type tuples", () => {
    const tuple = getTypeIsArrayTuple(String, false);
    expect(tuple).toEqual([String, false]);
    expect(getTypeIsArrayTuple([Number], false)).toEqual([Number, true]);
    expect(getTypeIsArrayTuple(String, true)).toEqual([String, true]);
    expect(getTypeIsArrayTuple(undefined, false)).toEqual([undefined, false]);
    expect(getTypeIsArrayTuple("string", false)).toEqual(["string", false]);
  });
});
