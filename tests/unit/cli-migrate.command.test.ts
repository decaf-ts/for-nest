import { resolveMigrateCommandConfig, buildFileVersionHandlers } from "../../src/cli-module";
import fs from "fs";
import os from "os";
import path from "path";

describe("nest cli migrate config resolver", () => {
  it("keeps CLI flags above package defaults", () => {
    const pkg = {
      version: "2.0.0",
      decaf: {
        migration: {
          toVersion: "1.0.0",
          taskMode: false,
          dryRun: false,
          flavours: ["nano"],
          input: "./defaults/app.module.js",
        },
      },
    };

    const { input, config } = resolveMigrateCommandConfig(
      {
        input: "./custom/app.module.js",
        to: "3.0.0",
        flavour: "typeorm",
        taskMode: "true",
        dryRun: "true",
      },
      pkg
    );

    expect(input).toBe("./custom/app.module.js");
    expect(config.toVersion).toBe("3.0.0");
    expect(config.taskMode).toBe(true);
    expect(config.dryRun).toBe(true);
    expect(config.flavours).toEqual(["typeorm"]);
  });

  it("falls back to package defaults and package version when CLI flags are missing", () => {
    const pkg = {
      version: "2.5.0",
      decaf: {
        migration: {
          taskMode: "true",
          dryRun: "false",
          flavour: "nano,typeorm",
          input: "./pkg/app.module.js",
        },
      },
    };

    const { input, config } = resolveMigrateCommandConfig({}, pkg);

    expect(input).toBe("./pkg/app.module.js");
    expect(config.toVersion).toBe("2.5.0");
    expect(config.taskMode).toBe(true);
    expect(config.dryRun).toBe(false);
    expect(config.flavours).toEqual(["nano", "typeorm"]);
  });

  it("reads versionDir from CLI flag, falling back to package.json", () => {
    const pkg = {
      version: "1.0.0",
      decaf: { migration: { versionDir: "./pkg-dir" } },
    };

    const { config: fromCli } = resolveMigrateCommandConfig({ versionDir: "./cli-dir" }, pkg);
    expect(fromCli.versionDir).toBe("./cli-dir");

    const { config: fromPkg } = resolveMigrateCommandConfig({}, pkg);
    expect(fromPkg.versionDir).toBe("./pkg-dir");

    const { config: neither } = resolveMigrateCommandConfig({}, { version: "1.0.0" });
    expect(neither.versionDir).toBeUndefined();
  });

  it("parses --reference as comma-separated list, falling back to package.json", () => {
    const pkg = {
      version: "1.0.0",
      decaf: { migration: { references: "ref-a,ref-b" } },
    };

    const { config: fromCli } = resolveMigrateCommandConfig({ reference: "ref-c,ref-d" }, pkg);
    expect(fromCli.references).toEqual(["ref-c", "ref-d"]);

    const { config: fromPkg } = resolveMigrateCommandConfig({}, pkg);
    expect(fromPkg.references).toEqual(["ref-a", "ref-b"]);

    const { config: empty } = resolveMigrateCommandConfig({}, { version: "1.0.0" });
    expect(empty.references).toEqual([]);
  });
});

describe("buildFileVersionHandlers", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-version-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns undefined from retrieveLastVersion when no file exists", async () => {
    const adapters = [{ alias: "nano" }] as any[];
    const handlers = buildFileVersionHandlers(tmpDir, adapters);
    const version = await handlers["nano"].retrieveLastVersion();
    expect(version).toBeUndefined();
  });

  it("persists and retrieves version via setCurrentVersion / retrieveLastVersion", async () => {
    const adapters = [{ alias: "typeorm" }] as any[];
    const handlers = buildFileVersionHandlers(tmpDir, adapters);

    await handlers["typeorm"].setCurrentVersion("2.3.1");
    const version = await handlers["typeorm"].retrieveLastVersion();
    expect(version).toBe("2.3.1");

    const file = path.join(tmpDir, "typeorm.migration.version");
    expect(fs.readFileSync(file, "utf-8").trim()).toBe("2.3.1");
  });

  it("creates versionDir if it does not exist", async () => {
    const nested = path.join(tmpDir, "deep", "nested");
    const adapters = [{ alias: "hlf" }] as any[];
    const handlers = buildFileVersionHandlers(nested, adapters);

    await handlers["hlf"].setCurrentVersion("1.0.0");
    expect(fs.existsSync(path.join(nested, "hlf.migration.version"))).toBe(true);
  });

  it("builds independent handlers per adapter alias", async () => {
    const adapters = [{ alias: "nano" }, { alias: "typeorm" }] as any[];
    const handlers = buildFileVersionHandlers(tmpDir, adapters);

    await handlers["nano"].setCurrentVersion("1.1.0");
    await handlers["typeorm"].setCurrentVersion("2.0.0");

    expect(await handlers["nano"].retrieveLastVersion()).toBe("1.1.0");
    expect(await handlers["typeorm"].retrieveLastVersion()).toBe("2.0.0");
  });
});
