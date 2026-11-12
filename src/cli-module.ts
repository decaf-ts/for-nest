import { Logging } from "@decaf-ts/logging";

const logger = Logging.for("for-nest");

import { Command } from "commander";
import { spawn } from "child_process";
import { Console } from "console";
import fs from "fs";
import path from "path";
import {
  Adapter,
  CompositeTaskBuilder,
  Condition,
  normalizeImport,
  OrderDirection,
  Service,
  TaskBackoffModel,
  TaskBuilder,
  TaskEngine,
  TaskEventModel,
  TaskEventType,
  TaskModel,
  TaskRetryOptions,
  TaskService,
  TaskStatus,
  TaskType,
} from "@decaf-ts/core";
import { SemverMigrationVersioning } from "@decaf-ts/core/migrations/SemverMigrationVersioning";
import { MigrationService } from "@decaf-ts/core/migrations";
import { InternalError } from "@decaf-ts/db-decorators";
import { NestFactory } from "@nestjs/core";
import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

const defaultInputCandidates = [
  "./lib/app.module.cjs",
  "./lib/app.module.js",
  "./src/app.module.ts",
];

const bootInputCandidates = ["./lib/main", "./lib/main.cjs", "./lib/main.js"];

function defaultCandidateExists(candidate: string): boolean {
  return fs.existsSync(path.join(process.cwd(), candidate));
}

export function resolveInputPath(
  input?: string,
  exists: (candidate: string) => boolean = defaultCandidateExists,
  candidates = defaultInputCandidates
): string {
  if (input) return input;
  const found = candidates.find((candidate) => exists(candidate));
  return found || "./src/app.module.ts";
}

export function buildOutputFilePath(params: {
  outputDir: string;
  pkgName?: string;
  name?: string;
  fileName?: string;
  appendVersion?: boolean;
  version?: string;
}): string {
  const {
    outputDir,
    pkgName,
    name,
    fileName,
    appendVersion = false,
    version,
  } = params;
  const baseDir = path.resolve(outputDir);
  const defaultPkgName = pkgName;
  const resolvedRawSource = fileName || name || defaultPkgName || "api";
  const baseName = path.basename(resolvedRawSource);
  const resolvedRaw = baseName.replace(/[\\/]/g, "_");
  const trimmed = resolvedRaw.replace(/^[._]+/, "");
  const resolvedName = trimmed || "api";
  const suffix = appendVersion && version ? `-${version}` : "";
  return path.join(baseDir, `${resolvedName}${suffix}.json`);
}

function parseList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value.flatMap((entry) => parseList(entry)).filter(Boolean);
  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBooleanFlag(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;

  const normalized = `${value}`.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new InternalError(`Invalid boolean flag value: ${value}`);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function resolveBootInputPath(
  input?: string,
  exists: (candidate: string) => boolean = defaultCandidateExists,
  candidates = bootInputCandidates
): string {
  if (input) return input;
  const found = candidates.find((candidate) => exists(candidate));
  return found || "./lib/main";
}

function runEntrypoint(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (!child.killed) child.kill(signal);
    };
    signals.forEach((signal) => process.once(signal, forwardSignal));

    const cleanup = () => {
      signals.forEach((signal) =>
        process.removeListener(signal, forwardSignal)
      );
    };

    child.once("error", (error) => {
      cleanup();
      reject(error);
    });

    child.once("close", (code, signal) => {
      cleanup();
      if (signal) {
        reject(new InternalError(`Boot process terminated by ${signal}`));
        return;
      }
      if (code && code !== 0) {
        reject(new InternalError(`Boot process exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

export function resolveMigrateCommandConfig(
  options: Record<string, unknown> = {},
  pkg: any = {}
): {
  input: string;
  config: {
    toVersion: string;
    taskMode: boolean | undefined;
    dryRun: boolean | undefined;
    flavours: string[];
    versionDir: string | undefined;
    references: string[];
  };
} {
  const packageMigration = pkg?.decaf?.migration ?? {};
  const input =
    (options.input as string | undefined) ||
    packageMigration.input ||
    "./src/app.module.ts";
  const toVersion =
    (options.to as string | undefined) ||
    packageMigration.toVersion ||
    pkg?.version ||
    "0.0.0";
  const cliFlavours = parseList(options.flavour ?? options.adapter);
  const packageFlavours = parseList(
    packageMigration.flavour ?? packageMigration.flavours
  );
  const flavours =
    cliFlavours.length > 0 ? unique(cliFlavours) : unique(packageFlavours);
  const versionDir =
    (options.versionDir as string | undefined) || packageMigration.versionDir;
  const references = parseList(
    options.reference ?? packageMigration.references
  );

  return {
    input,
    config: {
      toVersion,
      taskMode: parseBooleanFlag(options.taskMode ?? packageMigration.taskMode),
      dryRun: parseBooleanFlag(options.dryRun ?? packageMigration.dryRun),
      flavours,
      versionDir,
      references,
    },
  };
}

export function buildFileVersionHandlers(
  versionDir: string,
  adapters: Adapter<any, any, any, any>[]
): Partial<Record<string, any>> {
  const handlers: Record<string, any> = {};
  for (const adapter of adapters) {
    const alias = adapter.alias;
    const file = path.join(versionDir, `${alias}.migration.version`);
    handlers[alias] = {
      // adapter and ctxArgs are available but not needed — version lives in the file
      retrieveLastVersion: async (_adapter?: any, ..._args: any[]) => {
        try {
          if (fs.existsSync(file)) {
            const v = fs.readFileSync(file, "utf-8").trim();
            return v || undefined;
          }
        } catch {
          // no file yet → first run
        }
        return undefined;
      },
      setCurrentVersion: async (
        version: string,
        _adapter?: any,
        ..._args: any[]
      ) => {
        fs.mkdirSync(versionDir, { recursive: true });
        fs.writeFileSync(file, version, "utf-8");
      },
    };
  }
  return handlers;
}

const bootCommand = new Command()
  .name("boot")
  .description("boots the app entrypoint by delegating to node lib/main")
  .action(async () => {
    const input = resolveBootInputPath();
    const log = logger.for("boot");
    log.info(`Booting entrypoint from ${input}`);
    await runEntrypoint(input);
  });

const migrateCommand = new Command()
  .name("migrate")
  .description(
    "boots the app context headlessly, executes decaf migrations, and exits"
  )
  .option("--input <String>", "path to app module (ts or compiled)")
  .option("--to <String>", "target migration version")
  .option("--flavour <String>", "target flavour(s), comma-separated")
  .option(
    "--adapter <String>",
    "adapter flavour alias(es), comma-separated (same behavior as --flavour)"
  )
  .option(
    "--task-mode [Boolean]",
    "runs migration via task mode (true/false). accepts bare flag as true"
  )
  .option(
    "--dry-run [Boolean]",
    "runs migrations with dry-run context (true/false). accepts bare flag as true"
  )
  .option(
    "--version-dir <String>",
    "directory where per-adapter version files are persisted (e.g. a Docker volume path). " +
      "Each adapter writes its last-migrated version to <versionDir>/<alias>.migration.version. " +
      "Can also be set via package.json decaf.migration.versionDir."
  )
  .option(
    "--reference <String>",
    "run only the named migration reference(s), comma-separated (e.g. 'product-migration'). " +
      "Bypasses version range filtering — use for zero-day or one-off migrations. " +
      "Can also be set via package.json decaf.migration.references."
  )
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );
    const log = logger.for("migrate");
    const { input, config } = resolveMigrateCommandConfig(options, pkg);
    let app: INestApplication | undefined;
    try {
      app = await NestFactory.create(
        resolveNestModule(
          await normalizeImport(import(path.join(process.cwd(), input)))
        ),
        { logger: false }
      );
      await app.init();
      log.info(`App booted`);

      const cache = (Adapter as any)["_cache"] as Record<
        string,
        Adapter<any, any, any, any>
      >;
      const seen = new Set<string>();
      const adapters = Object.values(cache).filter((a) => {
        if (seen.has(a.alias)) return false;
        seen.add(a.alias);
        return true;
      });

      let taskService: any;
      if (config.taskMode) {
        try {
          taskService = Service.get(TaskModel);
        } catch {
          // not registered
        }
        if (!taskService)
          throw new InternalError(
            `task-mode requested but no TaskService is registered (expected @service(TaskModel))`
          );
      }

      // Exclude the task engine's adapter from migration targets — MigrationService
      // will throw if it appears in the adapter list alongside cfg.taskService.
      const taskAdapterAlias: string | undefined =
        (taskService as any)?.client?.adapter?.alias ||
        (taskService as any)?.client?.adapter?.flavour;
      const migrateAdapters = taskAdapterAlias
        ? adapters.filter(
            (a) =>
              a.alias !== taskAdapterAlias && a.flavour !== taskAdapterAlias
          )
        : adapters;

      const handlers = config.versionDir
        ? buildFileVersionHandlers(config.versionDir, migrateAdapters)
        : undefined;

      if (config.versionDir)
        log.info(`Version tracking: ${path.resolve(config.versionDir)}`);
      else
        log.warn(
          `No --version-dir set — every run will re-apply all migrations up to ${config.toVersion}`
        );

      if (config.references.length)
        log.info(`Running only references: ${config.references.join(", ")}`);

      const migrationService = await MigrationService.migrateAdapters(
        migrateAdapters,
        {
          toVersion: config.toVersion,
          taskMode: config.taskMode,
          dryRun: config.dryRun,
          flavours: config.flavours.length > 0 ? config.flavours : undefined,
          taskService,
          handlers,
          versioning: new SemverMigrationVersioning(),
          references:
            config.references.length > 0 ? config.references : undefined,
        }
      );

      await migrationService.track();

      log.info(
        `Migration completed${options.to || pkg.version ? ` up to ${options.to || pkg.version}` : ""}`
      );
    } catch (e: unknown) {
      throw new InternalError(e as Error);
    } finally {
      if (app) await app.close();
    }
  });

export { migrateCommand, bootCommand };

function resolveNestModule(mod: any): any {
  if (typeof mod === "function") return mod;
  if (mod?.default && typeof mod.default === "function") return mod.default;
  if (mod && typeof mod === "object") {
    const classes = Object.values(mod).filter((v) => typeof v === "function");
    if (classes.length === 1) return classes[0];
    const named = (mod as Record<string, any>)[
      Object.keys(mod).find((k) => /Module$/.test(k)) || ""
    ];
    if (typeof named === "function") return named;
  }
  return mod;
}

const exportApiCommand = new Command()
  .name("export-api")
  .description(
    "boots the app context headlessly, extracts the OpenAPI spec, and writes it to a JSON file"
  )
  .option("--input <String>", "path to app module (ts or compiled)")
  .option(
    "--output <String>",
    "output directory for the OpenAPI JSON file",
    "./"
  )
  .option(
    "--fileName <String>",
    "output file name (without extension)",
    "openapi"
  )
  .option("--title <String>", "OpenAPI document title", "DECAF API")
  .option(
    "--description <String>",
    "OpenAPI document description",
    "Auto-generated OpenAPI specification"
  )
  .option("--version <String>", "OpenAPI document version")
  .action(async (options: any) => {
    const log = logger.for("export-api");
    const input = resolveInputPath(options.input);
    let app: INestApplication | undefined;
    try {
      app = await NestFactory.create(
        resolveNestModule(
          await normalizeImport(import(path.join(process.cwd(), input)))
        ),
        { logger: false }
      );
      await app.init();
      log.info(`App booted from ${input}`);

      const config = new DocumentBuilder()
        .setTitle(options.title)
        .setDescription(options.description)
        .setVersion(options.version || "1.0.0")
        .addBearerAuth()
        .build();

      const document = SwaggerModule.createDocument(app, config);

      const outputDir = path.resolve(options.output);
      fs.mkdirSync(outputDir, { recursive: true });
      const outputFile = path.join(outputDir, `${options.fileName}.json`);
      fs.writeFileSync(outputFile, JSON.stringify(document, null, 2), "utf-8");

      const pathCount = Object.keys(document.paths || {}).length;
      const schemaCount = Object.keys(
        document.components?.schemas || {}
      ).length;
      log.info(
        `OpenAPI spec written to ${outputFile} (${pathCount} paths, ${schemaCount} schemas)`
      );
    } catch (e: unknown) {
      throw new InternalError(e as Error);
    } finally {
      if (app) await app.close();
    }
  });

const TERMINAL_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.SUCCEEDED,
  TaskStatus.FAILED,
  TaskStatus.CANCELED,
];

const RELATIVE_DATE_UNITS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Parses a JSON option value. Values prefixed with `@` are read from that file
 * (relative to the cwd), e.g. `--spec @./task.json`.
 */
export function parseJsonOption(value: unknown, label: string): any {
  if (value === undefined) return undefined;
  const raw = String(value);
  const text = raw.startsWith("@")
    ? fs.readFileSync(path.resolve(process.cwd(), raw.slice(1)), "utf-8")
    : raw;
  try {
    return JSON.parse(text);
  } catch (e: unknown) {
    throw new InternalError(
      `Invalid JSON for ${label}: ${(e as Error).message}`
    );
  }
}

/**
 * Parses an ISO date or a relative offset from now (`+30s`, `+5m`, `+2h`, `+1d`, `+500ms`).
 */
export function parseDateOption(
  value: unknown,
  now: number = Date.now()
): Date | undefined {
  if (value === undefined) return undefined;
  const raw = `${value}`.trim();
  const relative = /^\+(\d+)(ms|s|m|h|d)$/.exec(raw);
  if (relative)
    return new Date(
      now + Number(relative[1]) * RELATIVE_DATE_UNITS[relative[2]]
    );
  const date = new Date(raw);
  if (!raw || isNaN(date.getTime()))
    throw new InternalError(
      `Invalid date: ${value}. Use an ISO date or a relative offset like +30s, +5m, +2h or +1d`
    );
  return date;
}

function parsePositiveInt(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new InternalError(`${label} must be a non-negative integer`);
  return parsed;
}

/** step references are indexes when numeric, step names/classifications otherwise */
export function parseStepRef(value: unknown): number | string | undefined {
  if (value === undefined) return undefined;
  const raw = `${value}`.trim();
  return /^\d+$/.test(raw) ? Number(raw) : raw;
}

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

function parseStepOption(value: string, index: number): Record<string, any> {
  const raw = value.trim();
  if (raw.startsWith("{") || raw.startsWith("@"))
    return parseJsonOption(raw, `--step #${index + 1}`);
  return { classification: raw };
}

/**
 * Builds the task to submit from `nest task add` arguments. CLI flags override
 * the matching `--spec` fields; `--step` entries are appended to the spec's steps.
 * Tasks with steps default to composite.
 */
export function buildTaskFromOptions(
  classification: string | undefined,
  options: Record<string, any> = {}
): TaskModel {
  const spec = parseJsonOption(options.spec, "--spec") ?? {};
  if (typeof spec !== "object" || Array.isArray(spec))
    throw new InternalError(`--spec must be a JSON object`);

  const steps = [
    ...(Array.isArray(spec.steps) ? spec.steps : []),
    ...((options.step as string[] | undefined) ?? []).map(parseStepOption),
  ];
  const atomicity: TaskType =
    options.atomicity ??
    spec.atomicity ??
    (steps.length ? TaskType.COMPOSITE : TaskType.ATOMIC);
  if (!Object.values(TaskType).includes(atomicity))
    throw new InternalError(
      `Invalid atomicity ${atomicity}. Use one of ${Object.values(TaskType).join(", ")}`
    );
  if (atomicity === TaskType.ATOMIC && steps.length)
    throw new InternalError(`Atomic tasks cannot define steps`);

  const backoff = parseJsonOption(options.backoff, "--backoff") ?? spec.backoff;
  const dependencies = options.dependsOn
    ? parseList(options.dependsOn)
    : spec.dependencies;
  const maxAttempts =
    parsePositiveInt(options.maxAttempts, "--max-attempts") ?? spec.maxAttempts;

  const base = {
    classification: classification ?? spec.classification,
    name: options.name ?? spec.name,
    input:
      options.payload !== undefined
        ? parseJsonOption(options.payload, "--payload")
        : spec.input,
    lock: options.lock ?? spec.lock,
    dependencies,
    ...(maxAttempts !== undefined ? { maxAttempts } : {}),
    ...(backoff ? { backoff: new TaskBackoffModel(backoff) } : {}),
  };

  if (atomicity === TaskType.COMPOSITE) {
    const builder = new CompositeTaskBuilder(base as any);
    if (!steps.length)
      throw new InternalError(`Composite tasks require at least one --step`);
    return builder.setSteps(steps).build();
  }
  return new TaskBuilder(base as any).build();
}

/** compact, display-oriented view of a task */
export function summarizeTask(task: TaskModel): Record<string, any> {
  return {
    id: task.id,
    classification: task.classification,
    name: task.name,
    atomicity: task.atomicity,
    status: task.status,
    attempt: task.attempt,
    maxAttempts: task.maxAttempts,
    currentStep: task.currentStep,
    totalSteps: Array.isArray(task.steps) ? task.steps.length : undefined,
    scheduledTo: task.scheduledTo,
    nextRunAt: task.nextRunAt,
    error: task.error?.message,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

export function formatTaskLogs(task: TaskModel): string[] {
  return (task.logTail ?? []).map((entry) => {
    const ts =
      // @date fields override their formatting, so print a plain ISO timestamp
      entry.ts instanceof Date
        ? new Date(entry.ts.getTime()).toISOString()
        : `${entry.ts ?? ""}`;
    const step = typeof entry.step === "number" ? ` [step ${entry.step}]` : "";
    const meta =
      entry.meta === undefined ? "" : ` ${JSON.stringify(entry.meta)}`;
    return `${ts} ${`${entry.level}`.toUpperCase()}${step} ${entry.msg}${meta}`;
  });
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

type TaskCliContext = {
  service: TaskService<any>;
  engine: TaskEngine<any>;
};

/**
 * Resolves the task service of the booted app. Like `migrate`, the CLI presumes the app
 * boot already configured and started its task engine, and works through it.
 */
export async function resolveTaskCliContext(): Promise<TaskCliContext> {
  let service: TaskService<any>;
  try {
    service = Service.get<TaskService<any>, TaskModel>(TaskModel);
  } catch {
    throw new InternalError(
      `No TaskService is registered (expected @service(TaskModel))`
    );
  }
  let engine: TaskEngine<any>;
  try {
    engine = service.client;
  } catch {
    throw new InternalError(
      `TaskService is registered but was not initialized by the app boot`
    );
  }
  return { service, engine };
}

/**
 * Polls the task until it reaches a terminal status. The engine's trackers rely on an
 * in-process event bus, which a CLI process does not share with the running engine.
 */
export async function waitForTask(
  service: Pick<TaskService<any>, "read">,
  id: string,
  options: { timeoutMs?: number; pollMs?: number } = {},
  onStatus?: (task: TaskModel) => void
): Promise<TaskModel> {
  const { timeoutMs = 0, pollMs = 1000 } = options;
  const deadline = timeoutMs > 0 ? Date.now() + timeoutMs : undefined;
  let lastStatus: TaskStatus | undefined;
  for (;;) {
    const task = await service.read(id);
    if (task.status !== lastStatus) {
      lastStatus = task.status;
      onStatus?.(task);
    }
    if (TERMINAL_TASK_STATUSES.includes(task.status)) return task;
    if (deadline && Date.now() >= deadline)
      throw new InternalError(
        `Task ${id} did not finish within ${timeoutMs}ms (last status: ${task.status})`
      );
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

async function bootApp(input?: string): Promise<INestApplication> {
  const app = await NestFactory.create(
    resolveNestModule(
      await normalizeImport(
        import(path.join(process.cwd(), resolveInputPath(input)))
      )
    ),
    { logger: false }
  );
  await app.init();
  return app;
}

function waitOptions(options: Record<string, any>) {
  return {
    timeoutMs: parsePositiveInt(options.timeout, "--timeout"),
    pollMs: parsePositiveInt(options.pollMs, "--poll-ms"),
  };
}

async function finishWithWait(
  ctx: TaskCliContext,
  task: TaskModel,
  options: Record<string, any>
) {
  if (!options.wait) return printJson(task);
  const log = logger.for("task");
  const finished = await waitForTask(
    ctx.service,
    task.id,
    waitOptions(options),
    (t) => log.info(`Task ${t.id} is ${t.status}`)
  );
  printJson(finished);
  if (finished.status !== TaskStatus.SUCCEEDED) process.exitCode = 1;
}

const CONSOLE_LOG_METHODS = [
  "log",
  "info",
  "debug",
  "warn",
  "error",
  "trace",
] as const;

/**
 * Routes console output (where decaf logging writes) to stderr while `fn` runs, keeping
 * stdout for the command's data so it can be piped (e.g. `nest task list | jq`).
 */
export async function withLogsOnStderr<T>(fn: () => Promise<T>): Promise<T> {
  const original = CONSOLE_LOG_METHODS.map((method) => console[method]);
  const stderr = new Console({
    stdout: process.stderr,
    stderr: process.stderr,
  });
  CONSOLE_LOG_METHODS.forEach(
    (method) => (console[method] = stderr[method].bind(stderr))
  );
  try {
    return await fn();
  } finally {
    CONSOLE_LOG_METHODS.forEach((method, i) => (console[method] = original[i]));
  }
}

/**
 * Wraps a `nest task` action: boots the app from `--input`, resolves its task service
 * and always closes the app afterwards (which shuts its task engine down). Logs go to
 * stderr, data to stdout.
 */
function taskAction(
  fn: (
    ctx: TaskCliContext,
    args: string[],
    options: Record<string, any>
  ) => Promise<void>
) {
  return async (...received: any[]) => {
    const command = received[received.length - 1] as Command;
    const options = command.opts();
    const args = received.slice(0, command.registeredArguments.length);
    await withLogsOnStderr(async () => {
      let app: INestApplication | undefined;
      try {
        app = await bootApp(options.input);
        await fn(await resolveTaskCliContext(), args, options);
      } catch (e: unknown) {
        throw new InternalError(e as Error);
      } finally {
        if (app) await app.close();
      }
    });
  };
}

function taskSubcommand(name: string, description: string): Command {
  return new Command()
    .name(name)
    .description(description)
    .option("--input <String>", "path to app module (ts or compiled)");
}

function withWaitOptions(cmd: Command): Command {
  return cmd
    .option("--wait", "polls the task until it succeeds, fails or is canceled")
    .option("--timeout <Number>", "max ms to wait (0 waits forever)", "0")
    .option(
      "--poll-ms <Number>",
      "polling interval in ms while waiting",
      "1000"
    );
}

const taskAddCommand = withWaitOptions(
  taskSubcommand("add", "submits a new task to the task engine")
    .argument("[classification]", "task handler classification")
    .option(
      "--spec <JSON>",
      "full task definition as JSON (or @file.json); flags override its fields"
    )
    .option("--payload <JSON>", "task input as JSON (or @file.json)")
    .option("--name <String>", "task name")
    .option(
      "--atomicity <String>",
      "atomic or composite (default: composite when steps are given)"
    )
    .option(
      "--step <JSON|String>",
      "composite step: a classification or a JSON step spec (or @file.json). Repeatable",
      collect
    )
    .option("--lock <String>", "lock key")
    .option(
      "--depends-on <String>",
      "task dependencies, comma-separated ('<taskId>' or '<taskId>:<step>')"
    )
    .option("--max-attempts <Number>", "max attempts for the task")
    .option("--backoff <JSON>", "backoff configuration as JSON")
    .option(
      "--scheduled-to <Date>",
      "schedules the task: an ISO date or a relative offset like +5m"
    )
).action(
  taskAction(async (ctx, [classification], options) => {
    const task = buildTaskFromOptions(classification, options);
    const scheduledTo = parseDateOption(options.scheduledTo);
    const created = scheduledTo
      ? await ctx.engine.schedule(task).for(scheduledTo)
      : await ctx.service.push(task);
    await finishWithWait(ctx, created, options);
  })
);

const taskGetCommand = taskSubcommand("get", "prints a task")
  .argument("<id>", "task id")
  .action(
    taskAction(async (ctx, [id]) => {
      printJson(await ctx.service.read(id));
    })
  );

const taskListCommand = taskSubcommand("list", "queries tasks")
  .option(
    "--status <String>",
    `status(es), comma-separated (${Object.values(TaskStatus).join(", ")})`
  )
  .option("--classification <String>", "task classification")
  .option("--name <String>", "task name")
  .option("--order-by <String>", "field to sort by", "createdAt")
  .option("--direction <String>", "asc or desc", "desc")
  .option("--limit <Number>", "page size", "50")
  .option("--page <Number>", "page number, starting at 1", "1")
  .option("--full", "prints full tasks instead of summaries")
  .action(
    taskAction(async (ctx, _args, options) => {
      const conditions: Condition<TaskModel>[] = [];
      const statuses = parseList(options.status);
      const invalid = statuses.filter(
        (s) => !Object.values(TaskStatus).includes(s as TaskStatus)
      );
      if (invalid.length)
        throw new InternalError(`Invalid status: ${invalid.join(", ")}`);
      if (statuses.length === 1)
        conditions.push(Condition.attr<TaskModel>("status").eq(statuses[0]));
      if (statuses.length > 1)
        conditions.push(Condition.attr<TaskModel>("status").in(statuses));
      if (options.classification)
        conditions.push(
          Condition.attr<TaskModel>("classification").eq(options.classification)
        );
      if (options.name)
        conditions.push(Condition.attr<TaskModel>("name").eq(options.name));

      const direction = `${options.direction}`.toLowerCase();
      if (!["asc", "desc"].includes(direction))
        throw new InternalError(`--direction must be asc or desc`);
      const limit = parsePositiveInt(options.limit, "--limit") || 50;
      const page = Math.max(1, parsePositiveInt(options.page, "--page") || 1);

      const select = ctx.service.select();
      const filtered = conditions.length
        ? select.where(conditions.reduce((acc, c) => acc.and(c)))
        : select;
      const tasks = (await filtered
        .orderBy([
          options.orderBy as keyof TaskModel,
          direction === "asc" ? OrderDirection.ASC : OrderDirection.DSC,
        ])
        .limit(limit)
        .offset((page - 1) * limit)
        .execute()) as TaskModel[];
      printJson(options.full ? tasks : tasks.map(summarizeTask));
    })
  );

const taskCancelCommand = taskSubcommand("cancel", "cancels a task")
  .argument("<id>", "task id")
  .action(
    taskAction(async (ctx, [id]) => {
      printJson(await ctx.engine.cancel(id));
    })
  );

const taskRetryCommand = withWaitOptions(
  taskSubcommand(
    "retry",
    "re-queues a failed or canceled task. Composite tasks resume from the failed step unless --from-step is given"
  )
    .argument("<id>", "task id")
    .option(
      "--from-step <String>",
      "composite tasks: step index or step name/classification to resume from"
    )
    .option(
      "--keep-attempts",
      "keeps the attempt counter instead of granting a fresh maxAttempts budget"
    )
    .option(
      "--scheduled-to <Date>",
      "schedules the retry: an ISO date or a relative offset like +5m"
    )
).action(
  taskAction(async (ctx, [id], options) => {
    const retryOptions: TaskRetryOptions = {
      fromStep: parseStepRef(options.fromStep),
      resetAttempts: !options.keepAttempts,
      scheduledTo: parseDateOption(options.scheduledTo),
    };
    await finishWithWait(
      ctx,
      await ctx.service.retry(id, retryOptions),
      options
    );
  })
);

const taskWaitCommand = withWaitOptions(
  taskSubcommand(
    "wait",
    "waits for a task to succeed, fail or be canceled, then prints it. Exits with code 1 unless it succeeded"
  ).argument("<id>", "task id")
).action(
  taskAction(async (ctx, [id], options) => {
    await finishWithWait(ctx, await ctx.service.read(id), {
      ...options,
      wait: true,
    });
  })
);

const taskLogsCommand = taskSubcommand("logs", "prints a task's log tail")
  .argument("<id>", "task id")
  .option("--json", "prints raw log entries")
  .action(
    taskAction(async (ctx, [id], options) => {
      const task = await ctx.service.read(id);
      if (options.json) return printJson(task.logTail ?? []);
      const lines = formatTaskLogs(task);
      if (lines.length) process.stdout.write(`${lines.join("\n")}\n`);
    })
  );

const taskEventsCommand = taskSubcommand("events", "prints a task's events")
  .argument("<id>", "task id")
  .option(
    "--type <String>",
    `event type(s), comma-separated (${Object.values(TaskEventType)
      .filter((t) => t !== TaskEventType.ALL)
      .join(", ")})`
  )
  .option("--limit <Number>", "max events to print")
  .action(
    taskAction(async (ctx, [id], options) => {
      // the engine's event repository is bound to the task engine's adapter
      const events = ctx.engine["events"];
      const types = parseList(options.type);
      let condition = Condition.attr<TaskEventModel>("taskId").eq(id);
      if (types.length)
        condition = condition.and(
          Condition.attr<TaskEventModel>("classification").in(types)
        );
      const query = events
        .select()
        .where(condition)
        .orderBy(["ts", OrderDirection.ASC]);
      const limit = parsePositiveInt(options.limit, "--limit");
      printJson(
        (await (
          limit ? query.limit(limit) : query
        ).execute()) as TaskEventModel[]
      );
    })
  );

const taskDeleteCommand = taskSubcommand("delete", "deletes a task")
  .argument("<id>", "task id")
  .action(
    taskAction(async (ctx, [id]) => {
      printJson(await ctx.service.delete(id));
    })
  );

const taskCommand = new Command()
  .name("task")
  .description(
    "boots the app context headlessly and manages tasks of its (already running) task engine"
  );

[
  taskAddCommand,
  taskGetCommand,
  taskListCommand,
  taskCancelCommand,
  taskRetryCommand,
  taskWaitCommand,
  taskLogsCommand,
  taskEventsCommand,
  taskDeleteCommand,
].forEach((cmd) => taskCommand.addCommand(cmd));

export { taskCommand };

const nestCmd = new Command()
  .name("nest")
  .description("exposes various commands to help manage the nest integration");

nestCmd.addCommand(bootCommand);
nestCmd.addCommand(migrateCommand);
nestCmd.addCommand(exportApiCommand);
nestCmd.addCommand(taskCommand);

export default function nest() {
  return nestCmd;
}
