import { resolveMigrateCommandConfig } from "../../src/cli-module";

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
});
