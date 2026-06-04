import path from "path";

import nest from "../../src/cli-module";
import { TypeORMAdapter } from "@decaf-ts/for-typeorm";

import {
  createNanoTestResources,
  cleanupNanoTestResources,
  createTypeORMTestResources,
  cleanupTypeORMTestResources,
  seedLegacyNanoState,
  seedLegacyTypeormState,
  LIVE_MIGRATION_VERSION,
  NANO_COLLECTION,
  TYPEORM_TABLE,
  NanoResources,
  TypeormResources,
} from "./helpers/resources";

const CLI_FIXTURE = path.join(
  "tests",
  "integration",
  "fixtures",
  "cli-live-app.module.cjs"
);

const envKeys = [
  "NEST_CLI_NANO_USER",
  "NEST_CLI_NANO_PASSWORD",
  "NEST_CLI_NANO_DB",
  "NEST_CLI_NANO_HOST",
  "NEST_CLI_NANO_PROTOCOL",
  "NEST_CLI_TYPEORM_USER",
  "NEST_CLI_TYPEORM_PASSWORD",
  "NEST_CLI_TYPEORM_DB",
  "NEST_CLI_TYPEORM_HOST",
  "NEST_CLI_TYPEORM_PORT",
];

describe.skip("nest cli migrate command (live)", () => {
  let nanoResources: NanoResources | undefined;
  let typeormResources: TypeormResources | undefined;

  beforeAll(async () => {
    nanoResources = await createNanoTestResources("nest-cli-migration");
    typeormResources = await createTypeORMTestResources("nest-cli-migration");
  });

  afterAll(async () => {
    if (typeormResources) await cleanupTypeORMTestResources(typeormResources);
    if (nanoResources) await cleanupNanoTestResources(nanoResources);
  });

  beforeEach(() => {
    if (!nanoResources || !typeormResources) return;
    process.env.NEST_CLI_NANO_USER = nanoResources.user;
    process.env.NEST_CLI_NANO_PASSWORD = nanoResources.password;
    process.env.NEST_CLI_NANO_DB = nanoResources.dbName;
    process.env.NEST_CLI_NANO_HOST = nanoResources.host;
    process.env.NEST_CLI_NANO_PROTOCOL = nanoResources.protocol;

    process.env.NEST_CLI_TYPEORM_USER = typeormResources.user;
    process.env.NEST_CLI_TYPEORM_PASSWORD = typeormResources.password;
    process.env.NEST_CLI_TYPEORM_DB = typeormResources.dbName;
    process.env.NEST_CLI_TYPEORM_HOST = process.env.TYPEORM_HOST || "localhost";
    process.env.NEST_CLI_TYPEORM_PORT = process.env.TYPEORM_PORT || "5432";
  });

  afterEach(() => {
    envKeys.forEach((key) => {
      delete process.env[key];
    });
  });

  it("runs headless live migrations across nano and typeorm adapters", async () => {
    if (!nanoResources || !typeormResources) {
      throw new Error("test resources were not initialized");
    }

    await seedLegacyNanoState(nanoResources);
    await seedLegacyTypeormState(typeormResources);

    const cmd = nest();
    await cmd.parseAsync(
      [
        "node",
        "nest",
        "migrate",
        "--input",
        CLI_FIXTURE,
        "--to",
        LIVE_MIGRATION_VERSION,
        "--flavour",
        "nano,type-orm",
        "--task-mode",
        "true",
      ],
      { from: "node" }
    );

    const nanoDoc = await nanoResources.connection.db
      .use(nanoResources.dbName)
      .get(`${NANO_COLLECTION}__legacy`);
    expect((nanoDoc as any).migrationRequired).toBe("nano-default");

    const client = await TypeORMAdapter.connect({
      type: "postgres",
      host: process.env.TYPEORM_HOST || "localhost",
      port: Number(process.env.TYPEORM_PORT || "5432"),
      username: typeormResources.user,
      password: typeormResources.password,
      database: typeormResources.dbName,
    });
    try {
      const rows = await client.query(
        `SELECT id, "migrationRequired" FROM "${TYPEORM_TABLE}" WHERE id = $1`,
        ["cli-1"]
      );
      expect(rows[0].migrationRequired).toBe("typeorm-default");

      const info = await client.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = '${TYPEORM_TABLE}' AND column_name = 'migrationRequired'`
      );
      expect(info[0].is_nullable).toBe("NO");
    } finally {
      await client.destroy();
    }
  });
});
