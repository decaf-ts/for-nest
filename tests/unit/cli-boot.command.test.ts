import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import { spawn } from "child_process";

import nest from "../../src/cli-module";

jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));

const spawnMock = spawn as jest.MockedFunction<typeof spawn>;

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
