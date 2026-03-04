import path from "path";
import { buildOutputFilePath, resolveInputPath } from "../../src/cli-module";

describe("resolveInputPath", () => {
  it("returns the explicit input when provided", () => {
    const result = resolveInputPath("./custom/module.ts");
    expect(result).toBe("./custom/module.ts");
  });

  it("falls back to the first existing candidate", () => {
    const exists = jest.fn((candidate) => candidate === "./lib/app.module.js");
    const result = resolveInputPath(undefined, exists);
    expect(result).toBe("./lib/app.module.js");
    expect(exists).toHaveBeenCalledWith("./lib/app.module.cjs");
    expect(exists).toHaveBeenCalledWith("./lib/app.module.js");
  });

  it("defaults to ./src/app.module.ts when no candidate exists", () => {
    const result = resolveInputPath(undefined, () => false);
    expect(result).toBe("./src/app.module.ts");
  });
});

describe("buildOutputFilePath", () => {
  const outputDir = "./api-output";

  it("uses the package name's last segment and appends the version when requested", () => {
    const result = buildOutputFilePath({
      outputDir,
      pkgName: "@scope/package-name",
      appendVersion: true,
      version: "1.2.3",
    });
    expect(result).toBe(
      path.join(path.resolve(outputDir), "package-name-1.2.3.json")
    );
  });

  it("sanitizes slashes/paths in the resolved name", () => {
    const result = buildOutputFilePath({
      outputDir,
      pkgName: "@scope/package-name",
      name: "./nested/name",
    });
    expect(result).toBe(path.join(path.resolve(outputDir), "name.json"));
  });

  it("sanitizes fileName slashes and ignores directories", () => {
    const result = buildOutputFilePath({
      outputDir,
      pkgName: "@scope/package-name",
      fileName: "./nested/forced-name",
    });
    expect(result).toBe(
      path.join(path.resolve(outputDir), "forced-name.json")
    );
  });

  it("uses --fileName over pkg or --name", () => {
    const result = buildOutputFilePath({
      outputDir,
      pkgName: "@scope/package-name",
      name: "alternative",
      fileName: "forced-name",
    });
    expect(result).toBe(
      path.join(path.resolve(outputDir), "forced-name.json")
    );
  });
});
