import { Logging } from "@decaf-ts/logging";

const logger = Logging.for("for-nest");

import { Command } from "commander";
import fs from "fs";
import path from "path";
import { normalizeImport } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import { Logger } from "@decaf-ts/logging";
import { NestFactory } from "@nestjs/core";
import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { DECAF_ADAPTER_ID } from "./constants";
import { DecafCoreModule } from "./core-module";
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
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );
    const log = logger.for("migrate");
    const input = options.input || "./src/app.module.ts";
    let app: INestApplication | undefined;
    try {
      app = await NestFactory.create(
        await normalizeImport(import(path.join(process.cwd(), input))),
        {
          logger: false,
        }
      );
      await app.init();
      log.info(`App booted`);
      
      const migrations = await DecafMigrationModule.migrate({
        toVersion: options.to || pkg.version,
        taskMode: parseBooleanFlag(options.taskMode),
        dryRun: parseBooleanFlag(options.dryRun),
      });
      
      for (const migrationService of migrations || []) {
        await migrationService.track();
      }
      
      log.info(
        `Migration completed${(options.to || pkg.version) ? ` up to ${options.to || pkg.version}` : ""}`
      );
    } catch (e: unknown) {
      throw new InternalError(e as Error);
    } finally {
      if (app) await app.close();
    }
  });

const nestCmd = new Command()
  .name("nest")
  .description("exposes several commands to help manage the nest integration");

nestCmd.addCommand(migrateCommand);

export default function nest() {
  return nestCmd;
}
