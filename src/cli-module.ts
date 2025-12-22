import { Logging } from "@decaf-ts/logging";

const logger = Logging.for("for-nest");

import { Command } from "commander";
import fs from "fs";
import path from "path";
import { normalizeImport } from "@decaf-ts/for-fabric/shared";
import { InternalError } from "@decaf-ts/db-decorators";
import { Logger } from "@decaf-ts/logging";
import { NestFactory } from "@nestjs/core";
import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootApp(log: Logger, p: string) {
  log = log.for(bootApp);
  let module: any;
  try {
    module = await normalizeImport(import(p));
  } catch (e: unknown) {
    throw new InternalError(`Failed to load module under ${p}: ${e}`);
  }

  log.verbose(`Booting app without opening a port`);
  const app: INestApplication = await NestFactory.create(module, {
    logger: false,
  });
  await app.init();
  log.info(`dev mode app booted`);
  return app;
}

async function shutdownApp(log: Logger, app: INestApplication) {
  log.for(shutdownApp).verbose(`Shutting down app`);
  await app.close();
}

async function createSwagger(
  log: Logger,
  app: INestApplication,
  cfg: { title: string; description: string; version: string }
) {
  const { title, description, version } = cfg;
  const config = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion(version)
    .build();

  log = log.for(createSwagger);
  log.verbose(`Creating swgger`);
  const document = SwaggerModule.createDocument(app, config);
  log.info(`Swagger doc created`);
  return document;
}

const compileCommand = new Command()
  .name("export-api")
  .description("exports the api in json format")
  .option("--input <String>", "path to app module", "./src/app.module.ts")
  .option("--output <String>", "output folder for api definition file", "./")
  .option(
    "--appendVersion <Boolean>",
    "if the version if to be appended to the json file name",
    false
  )
  .option(
    "--title [String]",
    "title of the OpenApi spec. defaults to name in package"
  )
  .option(
    "--description [String]",
    "description of the OpenApi spec. defaults to description in package"
  )
  .option(
    "--name [String]",
    "file name (without json). defaults to name on package.json"
  )
  .action(async (options: any) => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
    );

    const version = pkg.version;

    // eslint-disable-next-line prefer-const
    let { title, name, description, output, input, appendVersion } = options;
    const log = logger.for("export-api");
    log.debug(
      `running with options: ${JSON.stringify(options)} for ${pkg.name} version ${version}`
    );

    description = description = description || pkg.description;
    title = title || pkg.name;

    output = path.resolve(output);
    try {
      fs.statfsSync(output);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      fs.mkdirSync(output, { recursive: true });
    }

    output = path.resolve(
      path.join(
        output,
        (name || pkg.name) + (appendVersion ? `-${version}` : "") + ".json"
      )
    );

    const app = await bootApp(log, input);
    const document = await createSwagger(log, app, {
      title,
      description,
      version,
    });

    try {
      fs.writeFileSync(output, JSON.stringify(document, null, 2), "utf8");
    } catch (e: unknown) {
      throw new InternalError(e as Error);
    } finally {
      await shutdownApp(log, app);
    }
  });

const nestCmd = new Command()
  .name("nest")
  .description("exposes several commands to help manage the nest integration");

nestCmd.addCommand(compileCommand);

export default function nest() {
  return nestCmd;
}
