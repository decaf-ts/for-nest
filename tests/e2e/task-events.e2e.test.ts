import { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  Adapter,
  defaultQueryAttr,
  OrderDirection,
  Repository,
} from "@decaf-ts/core";
import {
  TaskBackoffModel,
  TaskEventModel,
  TaskEventType,
  TaskModel,
  TaskStatus,
} from "@decaf-ts/core/tasks";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { DecafModule, DecafExceptionFilter, EventsController } from "../../src";
import { uses } from "@decaf-ts/decoration";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Subscription } from "rxjs";
import { RamTransformer } from "../../src/ram/index";

RamAdapter.decoration();
uses(RamFlavour)(TaskModel);
uses(RamFlavour)(TaskEventModel);

defaultQueryAttr()(TaskModel.prototype, "classification");
defaultQueryAttr()(TaskModel.prototype, "name");
defaultQueryAttr()(TaskEventModel.prototype, "taskId");
defaultQueryAttr()(TaskEventModel.prototype, "classification");

Adapter.setCurrent(RamFlavour);

const buildTask = (overrides: Partial<TaskModel> = {}) =>
  new TaskModel({
    classification:
      overrides.classification ??
      `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name:
      overrides.name ?? `task-name-${Math.random().toString(36).slice(2, 6)}`,
    maxAttempts: overrides.maxAttempts ?? 3,
    backoff: overrides.backoff ?? new TaskBackoffModel(),
    atomicity: overrides.atomicity ?? TaskModel.prototype.atomicity,
    ...overrides,
  });

describe("TaskModel and TaskEventModel observables (for-nest)", () => {
  let app: INestApplication;
  let taskRepo: Repository<TaskModel>;
  let eventRepo: Repository<TaskEventModel>;
  let eventsController: EventsController;

  beforeAll(async () => {
    app = await NestFactory.create(
      await DecafModule.forRootAsync({
        conf: [[RamAdapter, {}, new RamTransformer()]],
        autoControllers: true,
        autoServices: true,
        observerOptions: { enableObserverEvents: true },
      })
    );
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.listen(0);

    taskRepo = Repository.forModel(TaskModel);
    eventRepo = Repository.forModel(TaskEventModel);
    eventsController = await app.resolve(EventsController);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    const [tasks, events] = await Promise.all([
      taskRepo.select().execute(),
      eventRepo.select().execute(),
    ]);
    if (tasks.length) await taskRepo.deleteAll(tasks.map((t) => t.id));
    if (events.length) await eventRepo.deleteAll(events.map((evt) => evt.id));
  });

  it("performs CRUD, query, and bulk operations", async () => {
    const created = await taskRepo.create(
      buildTask({ classification: "crud-task" })
    );
    expect(created.classification).toBe("crud-task");

    const read = await taskRepo.read(created.id);
    expect(read.id).toBe(created.id);

    read.status = TaskStatus.SUCCEEDED;
    read.output = { value: 123 };
    const updated = await taskRepo.update(read);
    expect(updated.status).toBe(TaskStatus.SUCCEEDED);
    expect(updated.output).toEqual({ value: 123 });

    await taskRepo.delete(updated.id);
    await expect(taskRepo.read(updated.id)).rejects.toThrow();

    const many = [
      buildTask({ classification: "bulk-1" }),
      buildTask({ classification: "bulk-2" }),
    ];
    const bulkCreated = await taskRepo.createAll(many);
    expect(bulkCreated).toHaveLength(2);
    const bulkRead = await taskRepo.readAll(bulkCreated.map((t) => t.id));
    expect(bulkRead).toHaveLength(2);

    bulkRead[0].status = TaskStatus.SUCCEEDED;
    bulkRead[1].status = TaskStatus.FAILED;
    const bulkUpdated = await taskRepo.updateAll(bulkRead);
    expect(bulkUpdated.map((t) => t.status)).toEqual(
      expect.arrayContaining([TaskStatus.SUCCEEDED, TaskStatus.FAILED])
    );

    const list = await taskRepo.listBy("createdAt", OrderDirection.ASC);
    expect(list.length).toBeGreaterThanOrEqual(2);

    const paged = await taskRepo.paginateBy("createdAt", OrderDirection.ASC, {
      offset: 1,
      limit: 2,
    });
    expect(paged.data.length).toBeGreaterThanOrEqual(1);

    const finder = await taskRepo.find("task", OrderDirection.ASC);
    expect(finder.length).toBeGreaterThanOrEqual(2);

    const pageResult = await taskRepo.page("task", OrderDirection.ASC, {
      offset: 1,
      limit: 1,
    });
    expect(pageResult.data).toHaveLength(1);

    await taskRepo.deleteAll(bulkUpdated.map((t) => t.id));
    await expect(taskRepo.read(bulkUpdated[0].id)).rejects.toThrow();

    const eventTask = await taskRepo.create(
      buildTask({ classification: "event-task" })
    );

    const eventsPayload = [
      new TaskEventModel({
        taskId: eventTask.id,
        classification: TaskEventType.STATUS,
        payload: { status: TaskStatus.RUNNING },
      }),
      new TaskEventModel({
        taskId: eventTask.id,
        classification: TaskEventType.PROGRESS,
        payload: { detail: "halfway" },
      }),
    ];

    const createdEvents = await eventRepo.createAll(eventsPayload);
    expect(createdEvents).toHaveLength(2);

    const listedEvents = await eventRepo.listBy("ts", OrderDirection.DSC);
    expect(listedEvents.length).toBeGreaterThanOrEqual(2);

    const foundOf = await eventRepo.find(eventTask.id, OrderDirection.DSC);
    expect(foundOf.some((evt) => evt.taskId === eventTask.id)).toBe(true);

    const findByClassification = await eventRepo.findBy(
      "classification",
      TaskEventType.STATUS
    );
    expect(
      findByClassification.every(
        (evt) => evt.classification === TaskEventType.STATUS
      )
    ).toBe(true);

    const foundOne = await eventRepo.findOneBy(
      "classification",
      TaskEventType.PROGRESS
    );
    expect(foundOne?.classification).toBe(TaskEventType.PROGRESS);

    await eventRepo.deleteAll(createdEvents.map((evt) => evt.id));
    await expect(eventRepo.read(createdEvents[0].id)).rejects.toThrow();
  });

  it("emits persistence events through the observable stream", async () => {
    const collected: unknown[] = [];
    const observable = eventsController.listenForModel("TaskModel");
    const subscription: Subscription = observable.subscribe({
      next: (message) => {
        if (message?.data) {
          const payload =
            typeof message.data === "string"
              ? JSON.parse(message.data)
              : message.data;
          collected.push(Array.isArray(payload?.data) ? payload.data : payload);
        }
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const task = await taskRepo.create(
        buildTask({ classification: "obs-task" })
      );
      const updated = await taskRepo.update({
        ...task,
        status: TaskStatus.RUNNING,
      });
      await eventRepo.create(
        new TaskEventModel({
          taskId: updated.id,
          classification: TaskEventType.STATUS,
          payload: { status: TaskStatus.SUCCEEDED, output: { ok: true } },
        })
      );

      await waitFor(
        () =>
          collected.some(
            (entry) =>
              Array.isArray(entry) &&
              (entry[0] === TaskModel || entry[0]?.name === TaskModel.name) &&
              entry[1] === OperationKeys.CREATE
          ),
        3000
      );
      expect(
        collected.some(
          (entry) =>
            Array.isArray(entry) &&
            (entry[0] === TaskModel || entry[0]?.name === TaskModel.name) &&
            entry[1] === OperationKeys.CREATE
        )
      ).toBe(true);
      await waitFor(
        () =>
          collected.some(
            (entry) =>
              Array.isArray(entry) &&
              (entry[0] === TaskEventModel ||
                entry[0]?.name === TaskEventModel.name) &&
              entry[1] === OperationKeys.CREATE
          ),
        3000
      );
      expect(
        collected.some(
          (entry) =>
            Array.isArray(entry) &&
            (entry[0] === TaskEventModel ||
              entry[0]?.name === TaskEventModel.name) &&
            entry[1] === OperationKeys.CREATE
        )
      ).toBe(true);
    } finally {
      subscription.unsubscribe();
    }
  });
});

async function waitFor(predicate: () => boolean, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for events");
}
