import { Logging } from "@decaf-ts/logging";

const logger = Logging.for("for-nest");

import { Command } from "commander";
import fs from "fs";
import path from "path";
import { Adapter, normalizeImport, Service, TaskModel } from "@decaf-ts/core";
import { SemverMigrationVersioning } from "@decaf-ts/core/migrations/SemverMigrationVersioning";
import { InternalError } from "@decaf-ts/db-decorators";
import { NestFactory } from "@nestjs/core";
import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { DecafMigrationModule } from "./migrations";

const defaultInputCandidates = [
  "./lib/app.module.cjs",
  "./lib/app.module.js",
  "./src/app.module.ts",
];

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
  const flavours = cliFlavours.length > 0 ? unique(cliFlavours) : unique(packageFlavours);
  const versionDir =
    (options.versionDir as string | undefined) || packageMigration.versionDir;
  const references = parseList(options.reference ?? packageMigration.references);

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
): Record<string, { retrieveLastVersion: () => Promise<string | undefined>; setCurrentVersion: (v: string) => Promise<void> }> {
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
      setCurrentVersion: async (version: string, _adapter?: any, ..._args: any[]) => {
        fs.mkdirSync(versionDir, { recursive: true });
        fs.writeFileSync(file, version, "utf-8");
      },
    };
  }
  return handlers;
}

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
        await normalizeImport(import(path.join(process.cwd(), input))),
        { logger: false }
      );
      await app.init();
      log.info(`App booted`);

      const cache = (Adapter as any)["_cache"] as Record<string, Adapter<any, any, any, any>>;
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
        ? adapters.filter((a) => a.alias !== taskAdapterAlias && a.flavour !== taskAdapterAlias)
        : adapters;

      const handlers = config.versionDir
        ? buildFileVersionHandlers(config.versionDir, migrateAdapters)
        : undefined;

      if (config.versionDir)
        log.info(`Version tracking: ${path.resolve(config.versionDir)}`);
      else
        log.warn(`No --version-dir set — every run will re-apply all migrations up to ${config.toVersion}`);

      if (config.references.length)
        log.info(`Running only references: ${config.references.join(", ")}`);

      const migrations = await DecafMigrationModule.migrate(
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
        },
        migrateAdapters
      );

      for (const migrationService of migrations || []) {
        await migrationService.track();
      }

      log.info(
        `Migration completed${options.to || pkg.version ? ` up to ${options.to || pkg.version}` : ""}`
      );
    } catch (e: unknown) {
      throw new InternalError(e as Error);
    } finally {
      if (app) await app.close();
    }
  });

export { migrateCommand };

const nestCmd = new Command()
  .name("nest")
  .description("exposes several commands to help manage the nest integration");

nestCmd.addCommand(migrateCommand);

export default function nest() {
  return nestCmd;
}
