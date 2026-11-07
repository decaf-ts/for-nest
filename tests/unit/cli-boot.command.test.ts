import { jest } from "@jest/globals";
import { it } from "@decaf-ts/for-testing";
import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

const spawnMock = jest.fn();

await jest.unstable_mockModule("node:child_process", () => ({
  default: { spawn: spawnMock },
  spawn: spawnMock,
}));
const { default: nest } = await import("../../src/cli-module");

describe("nest cli boot command", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("registers the boot command", () => {
    const names = nest().commands.map((command) => command.name());
    expect(names).toContain("boot");
  });

  it("delegates to node lib/main when the boot command runs", async () => {
    jest.spyOn(fs, "existsSync").mockImplementation((candidate) =>
      String(candidate).endsWith(path.join("lib", "main"))
    );

    const child = new EventEmitter() as EventEmitter & {
      kill: jest.Mock;
      killed: boolean;
    };
    child.kill = jest.fn();
    child.killed = false;

    spawnMock.mockImplementation(() => {
      process.nextTick(() => child.emit("close", 0, null));
      return child as any;
    });

    await nest().parseAsync(["node", "nest", "boot"], { from: "node" });

    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      ["./lib/main"],
      expect.objectContaining({
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      })
    );
  });
});
