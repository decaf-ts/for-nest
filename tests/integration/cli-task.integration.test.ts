import { jest } from "@jest/globals";
import { it } from "@decaf-ts/for-testing";
import path from "path";
import { TaskEventType, TaskStatus, TaskType } from "@decaf-ts/core";
import nest from "../../src/cli-module";
import {
  CliFlakyHandler,
  cliTaskService,
} from "./fixtures/cli-task-app.module";

jest.setTimeout(60000);

const CLI_FIXTURE = path.join(
  "tests",
  "integration",
  "fixtures",
  "cli-task-app.module.ts"
);

type CliResult = { out: string; json: any };

async function runTask(...args: string[]): Promise<CliResult> {
  const writes: string[] = [];
  const spy = jest
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: any) => {
      writes.push(String(chunk));
      return true;
    });
  try {
    await nest().parseAsync(
      ["node", "nest", "task", ...args, "--input", CLI_FIXTURE],
      { from: "node" }
    );
  } finally {
    spy.mockRestore();
  }
  const out = writes.join("");
  let json: any;
  try {
    json = JSON.parse(out);
  } catch {
    json = undefined;
  }
  return { out, json };
}

const waitArgs = ["--wait", "--poll-ms", "50", "--timeout", "20000"];

describe("nest cli task command", () => {
  beforeEach(() => {
    CliFlakyHandler.failing = false;
    CliFlakyHandler.runs = 0;
    process.exitCode = undefined;
  });

  afterAll(async () => {
    process.exitCode = undefined;
    await cliTaskService().client.stop();
  });

  it("adds an atomic task and waits for its result", async () => {
    const { json } = await runTask(
      "add",
      "cli-echo",
      "--payload",
      '{"hello":"world"}',
      "--name",
      "echo-task",
      ...waitArgs
    );

    expect(json.status).toBe(TaskStatus.SUCCEEDED);
    expect(json.atomicity).toBe(TaskType.ATOMIC);
    expect(json.name).toBe("echo-task");
    expect(json.output).toEqual({ hello: "world" });
    expect(process.exitCode).toBeUndefined();
  });

  it("adds a task without waiting and reads it back with get", async () => {
    const { json: created } = await runTask(
      "add",
      "cli-echo",
      "--payload",
      "42"
    );
    expect(created.id).toEqual(expect.any(String));

    const { json: finished } = await runTask(
      "wait",
      created.id,
      "--poll-ms",
      "50"
    );
    expect(finished.status).toBe(TaskStatus.SUCCEEDED);

    const { json: read } = await runTask("get", created.id);
    expect(read.id).toBe(created.id);
    expect(read.output).toBe(42);
  });

  it("retries a failed composite task from the failed step", async () => {
    CliFlakyHandler.failing = true;
    const { json: failed } = await runTask(
      "add",
      "cli-composite",
      "--step",
      '{"classification":"cli-echo","name":"first","input":"one"}',
      "--step",
      "cli-flaky",
      ...waitArgs
    );

    expect(failed.atomicity).toBe(TaskType.COMPOSITE);
    expect(failed.status).toBe(TaskStatus.FAILED);
    expect(failed.stepResults[0].output).toBe("one");
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;

    CliFlakyHandler.failing = false;
    const { json: retried } = await runTask("retry", failed.id, ...waitArgs);

    expect(retried.status).toBe(TaskStatus.SUCCEEDED);
    expect(retried.stepResults.map((r: any) => r.output)).toEqual([
      "one",
      "flaky-ok",
    ]);
    expect(CliFlakyHandler.runs).toBe(2);
    expect(process.exitCode).toBeUndefined();
  });

  it("re-runs a composite task from a step chosen by name", async () => {
    const { json: done } = await runTask(
      "add",
      "cli-composite",
      "--step",
      '{"classification":"cli-echo","name":"first","input":"one"}',
      "--step",
      "cli-flaky",
      ...waitArgs
    );
    expect(done.status).toBe(TaskStatus.SUCCEEDED);

    // retry only accepts failed or canceled tasks
    await expect(runTask("retry", done.id)).rejects.toThrow(
      /can only be retried/
    );

    const { json: scheduled } = await runTask(
      "add",
      "cli-composite",
      "--step",
      '{"classification":"cli-echo","name":"first","input":"one"}',
      "--step",
      "cli-flaky",
      "--scheduled-to",
      "+1h"
    );
    await runTask("cancel", scheduled.id);

    const { json: retried } = await runTask(
      "retry",
      scheduled.id,
      "--from-step",
      "first",
      ...waitArgs
    );
    expect(retried.status).toBe(TaskStatus.SUCCEEDED);
    expect(retried.stepResults).toHaveLength(2);
  });

  it("schedules, lists and cancels tasks", async () => {
    const { json: scheduled } = await runTask(
      "add",
      "cli-echo",
      "--name",
      "cli-scheduled",
      "--scheduled-to",
      "+1h"
    );
    expect(scheduled.status).toBe(TaskStatus.SCHEDULED);
    expect(new Date(scheduled.scheduledTo).getTime()).toBeGreaterThan(
      Date.now() + 59 * 60_000
    );

    const { json: listed } = await runTask(
      "list",
      "--status",
      "scheduled",
      "--name",
      "cli-scheduled"
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      id: scheduled.id,
      status: TaskStatus.SCHEDULED,
      classification: "cli-echo",
    });
    expect(listed[0].input).toBeUndefined();

    const { json: canceled } = await runTask("cancel", scheduled.id);
    expect(canceled.status).toBe(TaskStatus.CANCELED);

    const { json: waited } = await runTask("wait", scheduled.id);
    expect(waited.status).toBe(TaskStatus.CANCELED);
    expect(process.exitCode).toBe(1);
  });

  it("lists with filters, ordering and paging", async () => {
    for (const payload of ["1", "2", "3"])
      await runTask(
        "add",
        "cli-echo",
        "--name",
        "cli-paged",
        "--payload",
        payload,
        ...waitArgs
      );

    const { json: all } = await runTask(
      "list",
      "--name",
      "cli-paged",
      "--order-by",
      "createdAt",
      "--direction",
      "asc",
      "--full"
    );
    expect(all.map((t: any) => t.output)).toEqual([1, 2, 3]);

    const { json: page2 } = await runTask(
      "list",
      "--name",
      "cli-paged",
      "--order-by",
      "createdAt",
      "--direction",
      "asc",
      "--limit",
      "2",
      "--page",
      "2"
    );
    expect(page2.map((t: any) => t.id)).toEqual([all[2].id]);

    const { json: none } = await runTask(
      "list",
      "--name",
      "cli-paged",
      "--status",
      "failed,canceled"
    );
    expect(none).toEqual([]);
  });

  it("prints logs and events, and deletes tasks", async () => {
    const { json: done } = await runTask(
      "add",
      "cli-echo",
      "--payload",
      '"logged"',
      ...waitArgs
    );

    const { out: logs } = await runTask("logs", done.id);
    expect(logs).toMatch(/INFO .*echo "logged"/);

    const { json: rawLogs } = await runTask("logs", done.id, "--json");
    expect(rawLogs.some((e: any) => e.msg.includes('echo "logged"'))).toBe(
      true
    );

    const { json: events } = await runTask(
      "events",
      done.id,
      "--type",
      TaskEventType.STATUS
    );
    expect(events.length).toBeGreaterThan(0);
    expect(
      events.every((e: any) => e.classification === TaskEventType.STATUS)
    ).toBe(true);
    expect(events.map((e: any) => e.payload?.status)).toContain(
      TaskStatus.SUCCEEDED
    );

    const { json: deleted } = await runTask("delete", done.id);
    expect(deleted.id).toBe(done.id);
    await expect(runTask("get", done.id)).rejects.toThrow();
  });

  it("rejects invalid input before submitting anything", async () => {
    await expect(
      runTask("add", "cli-echo", "--scheduled-to", "not-a-date")
    ).rejects.toThrow(/Invalid date/);
    await expect(
      runTask("add", "cli-echo", "--payload", "{bad")
    ).rejects.toThrow(/Invalid JSON for --payload/);
    await expect(
      runTask("add", "cli-echo", "--atomicity", "atomic", "--step", "cli-echo")
    ).rejects.toThrow(/Atomic tasks cannot define steps/);
    await expect(runTask("list", "--status", "nope")).rejects.toThrow(
      /Invalid status: nope/
    );
  });
});
