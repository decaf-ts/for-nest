import { it } from "@decaf-ts/for-testing";
import fs from "fs";
import os from "os";
import path from "path";
import {
  TaskLogEntryModel,
  TaskModel,
  TaskStatus,
  TaskType,
} from "@decaf-ts/core";
import { LogLevel } from "@decaf-ts/logging";
import nest, {
  buildTaskFromOptions,
  formatTaskLogs,
  parseDateOption,
  parseJsonOption,
  parseStepRef,
  summarizeTask,
  waitForTask,
  withLogsOnStderr,
} from "../../src/cli-module";

describe("nest cli task helpers", () => {
  describe("parseDateOption", () => {
    const now = Date.UTC(2026, 0, 1, 12, 0, 0);

    it("parses relative offsets from now", () => {
      expect(parseDateOption("+500ms", now)?.getTime()).toBe(now + 500);
      expect(parseDateOption("+30s", now)?.getTime()).toBe(now + 30_000);
      expect(parseDateOption("+5m", now)?.getTime()).toBe(now + 300_000);
      expect(parseDateOption("+2h", now)?.getTime()).toBe(now + 7_200_000);
      expect(parseDateOption("+1d", now)?.getTime()).toBe(now + 86_400_000);
    });

    it("parses ISO dates and passes undefined through", () => {
      expect(parseDateOption("2026-02-03T04:05:06.000Z")?.toISOString()).toBe(
        "2026-02-03T04:05:06.000Z"
      );
      expect(parseDateOption(undefined)).toBeUndefined();
    });

    it("rejects invalid dates", () => {
      expect(() => parseDateOption("soon")).toThrow(/Invalid date: soon/);
      expect(() => parseDateOption("")).toThrow(/Invalid date/);
      expect(() => parseDateOption("+5y")).toThrow(/Invalid date/);
    });
  });

  describe("parseJsonOption", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "decaf-task-cli-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("parses inline JSON and @file references", () => {
      expect(parseJsonOption('{"a":1}', "--payload")).toEqual({ a: 1 });
      expect(parseJsonOption("3", "--payload")).toBe(3);
      const file = path.join(tmpDir, "spec.json");
      fs.writeFileSync(file, '{"classification":"from-file"}');
      expect(parseJsonOption(`@${file}`, "--spec")).toEqual({
        classification: "from-file",
      });
      expect(parseJsonOption(undefined, "--spec")).toBeUndefined();
    });

    it("names the option on invalid JSON", () => {
      expect(() => parseJsonOption("{nope", "--backoff")).toThrow(
        /Invalid JSON for --backoff/
      );
    });
  });

  it("parseStepRef treats digits as indexes and anything else as names", () => {
    expect(parseStepRef("2")).toBe(2);
    expect(parseStepRef(" 0 ")).toBe(0);
    expect(parseStepRef("first")).toBe("first");
    expect(parseStepRef("step-2")).toBe("step-2");
    expect(parseStepRef(undefined)).toBeUndefined();
  });

  describe("buildTaskFromOptions", () => {
    it("builds an atomic task with defaults", () => {
      const task = buildTaskFromOptions("echo", { payload: '{"x":1}' });
      expect(task).toBeInstanceOf(TaskModel);
      expect(task.classification).toBe("echo");
      expect(task.atomicity).toBe(TaskType.ATOMIC);
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.input).toEqual({ x: 1 });
      expect(task.maxAttempts).toBe(1);
      expect(task.backoff).toBeDefined();
    });

    it("builds a composite task from --step entries and lets flags override the spec", () => {
      const task = buildTaskFromOptions(undefined, {
        spec: JSON.stringify({
          classification: "from-spec",
          name: "spec-name",
          maxAttempts: 2,
          steps: [{ classification: "a" }],
        }),
        name: "flag-name",
        maxAttempts: "4",
        lock: "my-lock",
        dependsOn: "dep-1,dep-2:0",
        backoff: '{"baseMs":5,"maxMs":50,"strategy":"fixed"}',
        step: ["b", '{"classification":"c","canFail":true}'],
      });
      expect(task.atomicity).toBe(TaskType.COMPOSITE);
      expect(task.classification).toBe("from-spec");
      expect(task.name).toBe("flag-name");
      expect(task.maxAttempts).toBe(4);
      expect(task.lock).toBe("my-lock");
      expect(task.dependencies).toEqual(["dep-1", "dep-2:0"]);
      expect(task.backoff).toMatchObject({ baseMs: 5, maxMs: 50 });
      expect(task.steps?.map((s) => s.classification)).toEqual(["a", "b", "c"]);
      expect(task.steps?.[2].canFail).toBe(true);
    });

    it("rejects inconsistent definitions", () => {
      expect(() => buildTaskFromOptions(undefined, {})).toThrow();
      expect(() =>
        buildTaskFromOptions("x", { atomicity: "atomic", step: ["a"] })
      ).toThrow(/Atomic tasks cannot define steps/);
      expect(() =>
        buildTaskFromOptions("x", { atomicity: "composite" })
      ).toThrow(/Composite tasks require at least one --step/);
      expect(() => buildTaskFromOptions("x", { atomicity: "weird" })).toThrow(
        /Invalid atomicity weird/
      );
      expect(() => buildTaskFromOptions("x", { spec: "[1]" })).toThrow(
        /--spec must be a JSON object/
      );
      expect(() => buildTaskFromOptions("x", { maxAttempts: "-1" })).toThrow(
        /--max-attempts must be a non-negative integer/
      );
    });
  });

  it("summarizeTask keeps the overview fields only", () => {
    const task = new TaskModel({
      id: "t-1",
      classification: "c",
      status: TaskStatus.FAILED,
      atomicity: TaskType.COMPOSITE,
      steps: [{ classification: "a" }, { classification: "b" }] as any,
      currentStep: 1,
      attempt: 1,
      maxAttempts: 3,
      error: { message: "boom" } as any,
      input: { secret: true },
    });
    const summary = summarizeTask(task);
    expect(summary).toMatchObject({
      id: "t-1",
      status: TaskStatus.FAILED,
      currentStep: 1,
      totalSteps: 2,
      attempt: 1,
      maxAttempts: 3,
      error: "boom",
    });
    expect(summary).not.toHaveProperty("input");
  });

  it("formatTaskLogs renders one line per entry with step and meta", () => {
    const ts = new Date("2026-01-01T00:00:00.000Z");
    const task = new TaskModel({
      logTail: [
        new TaskLogEntryModel({ ts, level: LogLevel.info, msg: "hello" }),
        new TaskLogEntryModel({
          ts,
          level: LogLevel.warn,
          msg: "careful",
          step: 1,
          meta: { a: 1 },
        }),
      ],
    });
    expect(formatTaskLogs(task)).toEqual([
      "2026-01-01T00:00:00.000Z INFO hello",
      '2026-01-01T00:00:00.000Z WARN [step 1] careful {"a":1}',
    ]);
    expect(formatTaskLogs(new TaskModel({ logTail: undefined }))).toEqual([]);
  });

  describe("waitForTask", () => {
    const sequence = (...statuses: TaskStatus[]) => {
      let i = 0;
      return {
        read: async (id: any) =>
          new TaskModel({
            id,
            status: statuses[Math.min(i++, statuses.length - 1)],
          }),
      };
    };

    it("polls until a terminal status and reports each status change once", async () => {
      const seen: TaskStatus[] = [];
      const task = await waitForTask(
        sequence(
          TaskStatus.PENDING,
          TaskStatus.RUNNING,
          TaskStatus.RUNNING,
          TaskStatus.SUCCEEDED
        ) as any,
        "t",
        { pollMs: 1 },
        (t) => seen.push(t.status)
      );
      expect(task.status).toBe(TaskStatus.SUCCEEDED);
      expect(seen).toEqual([
        TaskStatus.PENDING,
        TaskStatus.RUNNING,
        TaskStatus.SUCCEEDED,
      ]);
    });

    it("treats failed and canceled as terminal", async () => {
      for (const status of [TaskStatus.FAILED, TaskStatus.CANCELED])
        expect(
          (await waitForTask(sequence(status) as any, "t", { pollMs: 1 }))
            .status
        ).toBe(status);
    });

    it("times out with the last status", async () => {
      await expect(
        waitForTask(sequence(TaskStatus.SCHEDULED) as any, "t", {
          pollMs: 5,
          timeoutMs: 30,
        })
      ).rejects.toThrow(
        /did not finish within 30ms \(last status: scheduled\)/
      );
    });
  });

  it("withLogsOnStderr keeps stdout for data and restores the console", async () => {
    const originalLog = console.log;
    const writes: string[] = [];
    const write = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      writes.push(String(chunk));
      return true;
    }) as any;
    try {
      await expect(
        withLogsOnStderr(async () => {
          expect(console.log).not.toBe(originalLog);
          console.log("a log line");
          throw new Error("propagates");
        })
      ).rejects.toThrow("propagates");
    } finally {
      process.stdout.write = write;
    }
    expect(writes.join("")).not.toContain("a log line");
    expect(console.log).toBe(originalLog);
  });

  it("registers the task subcommands under nest", () => {
    const task = nest().commands.find((c) => c.name() === "task");
    expect(task).toBeDefined();
    expect(task!.commands.map((c) => c.name()).sort()).toEqual(
      [
        "add",
        "cancel",
        "delete",
        "events",
        "get",
        "list",
        "logs",
        "retry",
        "wait",
      ].sort()
    );
    for (const sub of task!.commands)
      expect(sub.options.map((o) => o.long)).toContain("--input");
  });
});
