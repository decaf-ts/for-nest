/* eslint-disable @typescript-eslint/no-unused-vars */
import { NestFactory } from "@nestjs/core";
import {
  column,
  pk,
} from "@decaf-ts/core";
import { model, required } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";
import {
  AbsMigration,
  migration,
  MigrationService,
} from "@decaf-ts/core/migrations";
import { RamAdapter } from "@decaf-ts/core/ram";
import { TaskEngine, TaskService } from "@decaf-ts/core/tasks";
import { ConflictError, NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter, NanoFlavour } from "@decaf-ts/for-nano";
import { TypeORMAdapter, TypeORMFlavour } from "@decaf-ts/for-typeorm";
import { DataSourceOptions } from "typeorm/data-source/DataSourceOptions";
import { DecafModule } from "../../src";
import { DECAF_ADAPTER_ID } from "../../src/constants";
import { RequestToContextTransformer } from "../../src/interceptors/context";

class NoopTransformer extends RequestToContextTransformer<any> {
  async from(): Promise<any> {
    return {};
  }
}

jest.setTimeout(90_000);

const NANO_FLAVOUR = NanoFlavour;
const TYPEORM_FLAVOUR = TypeORMFlavour;
const TASK_FLAVOUR = "nest-migration-live-task";
const TARGET_VERSION = "1.0.2";

const NANO_TABLE_A = "nest_live_nano_profile";
const NANO_TABLE_B = "nest_live_nano_customer";
const TYPEORM_TABLE_A = "nest_live_typeorm_prompt";
const TYPEORM_TABLE_B = "nest_live_typeorm_config";

const nanoAdminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
const nanoAdminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
const nanoHost = process.env.NANO_HOST || "localhost:10010";
const nanoProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";
const nanoCleanupDelayMs = Number(process.env.NANO_CLEANUP_DELAY_MS || "250");

const adminUser = process.env.TYPEORM_ADMIN_USER || "alfred";
const adminPassword = process.env.TYPEORM_ADMIN_PASSWORD || "password";
const adminDatabase = process.env.TYPEORM_ADMIN_DATABASE || "alfred";
const host = process.env.TYPEORM_HOST || "localhost";
const port = Number(process.env.TYPEORM_PORT || "5432");
const cleanupDelayMs = Number(process.env.TYPEORM_CLEANUP_DELAY_MS || "250");

const adminConfig: DataSourceOptions = {
  type: "postgres",
  username: adminUser,
  password: adminPassword,
  database: adminDatabase,
  host,
  port,
};

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function waitForCleanup(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function createNanoTestResources(prefix: string) {
  const suffix = randomSuffix();
  const dbName = `${prefix}_${suffix}`;
  const user = `${prefix}_user_${suffix}`;
  const password = `${user}_pw`;
  const connection = NanoAdapter.connect(
    nanoAdminUser,
    nanoAdminPassword,
    nanoHost,
    nanoProtocol
  );
  await NanoAdapter.createDatabase(connection, dbName).catch((e: any) => {
    if (!(e instanceof ConflictError)) throw e;
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (!(e instanceof ConflictError)) throw e;
    }
  );
  return {
    connection,
    dbName,
    user,
    password,
    host: nanoHost,
    protocol: nanoProtocol,
  };
}

async function cleanupNanoTestResources(resources: {
  connection: any;
  dbName: string;
  user: string;
}) {
  try {
    await NanoAdapter.deleteDatabase(resources.connection, resources.dbName);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  await waitForCleanup(nanoCleanupDelayMs);
  try {
    await NanoAdapter.deleteUser(
      resources.connection,
      resources.dbName,
      resources.user
    );
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  } finally {
    NanoAdapter.closeConnection(resources.connection);
  }
}

async function createTypeORMTestResources(prefix: string) {
  const suffix = randomSuffix();
  const dbName = `${prefix}_${suffix}`;
  const user = `${prefix}_user_${suffix}`;
  const password = `${user}_pw`;
  const adminConnection = await TypeORMAdapter.connect(adminConfig);
  try {
    await TypeORMAdapter.createDatabase(adminConnection, dbName);
  } catch (e: any) {
    if (!(e instanceof ConflictError)) throw e;
  } finally {
    await adminConnection.destroy();
  }
  const adminDbConfig: DataSourceOptions = { ...adminConfig, database: dbName };
  const adminDbConnection = await TypeORMAdapter.connect(adminDbConfig);
  try {
    await TypeORMAdapter.createUser(adminDbConnection, dbName, user, password);
    await TypeORMAdapter.createNotifyFunction(adminDbConnection, user);
  } finally {
    await adminDbConnection.destroy();
  }
  return { dbName, user, password };
}

async function cleanupTypeORMTestResources(resources: {
  dbName: string;
  user: string;
}) {
  const adminConnection = await TypeORMAdapter.connect(adminConfig);
  try {
    await TypeORMAdapter.deleteDatabase(
      adminConnection,
      resources.dbName,
      resources.user
    );
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  await waitForCleanup(cleanupDelayMs);
  try {
    await TypeORMAdapter.deleteUser(adminConnection, resources.user, adminUser);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  } finally {
    await adminConnection.destroy();
  }
}

@model({ name: NANO_TABLE_A })
@uses(NANO_FLAVOUR)
class NanoProfileV1 {
  @pk()
  id: string;
  @required()
  @column()
  name: string;
}

@model({ name: NANO_TABLE_B })
@uses(NANO_FLAVOUR)
class NanoCustomerV1 {
  @pk()
  id: string;
  @required()
  @column()
  email: string;
}

@model({ name: TYPEORM_TABLE_A })
@uses(TYPEORM_FLAVOUR)
class TypeormPromptV1 {
  @pk({ type: String, generated: false })
  id: string;
  @required()
  @column()
  body: string;
}

@model({ name: TYPEORM_TABLE_B })
@uses(TYPEORM_FLAVOUR)
class TypeormConfigV1 {
  @pk({ type: String, generated: false })
  id: string;
  @required()
  @column()
  key: string;
}

const failedOnce = new Set<string>();
function failFirst(reference: string) {
  if (failedOnce.has(reference)) return;
  failedOnce.add(reference);
  throw new Error(`intentional failure for ${reference}`);
}

function withNanoTable(tableName: string, doc: any) {
  return { ...doc, _id: `${tableName}__${doc.id}` };
}

async function addAndBackfillNonNullColumn(
  dataSource: any,
  tableName: string,
  columnName: string,
  value: string
) {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(
      `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" character varying`
    );
    await queryRunner.query(
      `UPDATE "${tableName}" SET "${columnName}" = $1 WHERE "${columnName}" IS NULL`,
      [value]
    );
    await queryRunner.query(
      `ALTER TABLE "${tableName}" ALTER COLUMN "${columnName}" SET NOT NULL`
    );
    await queryRunner.commitTransaction();
  } catch (e: unknown) {
    await queryRunner.rollbackTransaction();
    throw e;
  } finally {
    await queryRunner.release();
  }
}

@migration("1.0.1-nest-live-nano-profile", "1.0.1", NANO_FLAVOUR)
class NanoProfileMigration101 extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }
  async up(): Promise<void> {}
  async down(): Promise<void> {}
  async migrate(qr: any): Promise<void> {
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && doc._id?.startsWith(`${NANO_TABLE_A}__`))
      .map((doc: any) => ({ ...doc, segment: doc.segment || "retail" }));
    if (docs.length) await qr.bulk({ docs });
  }
}

@migration("1.0.1-nest-live-typeorm-prompt", "1.0.1", TYPEORM_FLAVOUR)
class TypeormPromptMigration101 extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }
  async up(): Promise<void> {}
  async down(): Promise<void> {}
  async migrate(qr: any): Promise<void> {
    await addAndBackfillNonNullColumn(qr, TYPEORM_TABLE_A, "category", "gen");
  }
}

@migration("1.0.2-nest-live-nano-customer", "1.0.2", NANO_FLAVOUR)
class NanoCustomerMigration102 extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }
  async up(): Promise<void> {}
  async down(): Promise<void> {}
  async migrate(qr: any): Promise<void> {
    failFirst("1.0.2-nest-live-nano-customer");
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && doc._id?.startsWith(`${NANO_TABLE_B}__`))
      .map((doc: any) => ({ ...doc, tier: doc.tier || "gold" }));
    if (docs.length) await qr.bulk({ docs });
  }
}

@migration("1.0.2-nest-live-typeorm-config", "1.0.2", TYPEORM_FLAVOUR)
class TypeormConfigMigration102 extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }
  async up(): Promise<void> {}
  async down(): Promise<void> {}
  async migrate(qr: any): Promise<void> {
    failFirst("1.0.2-nest-live-typeorm-config");
    await addAndBackfillNonNullColumn(qr, TYPEORM_TABLE_B, "scope", "system");
  }
}

describe("for-nest live task migration across Nano + TypeORM", () => {
  it("boots nest with 4 models and runs task-mode migration hops with retry+track", async () => {
    failedOnce.clear();
    const nanoResources = await createNanoTestResources("for_nest_live_migration");
    const typeormResources = await createTypeORMTestResources(
      "for_nest_live_migration"
    );
    const taskAdapter = new RamAdapter({}, TASK_FLAVOUR);
    const taskService = new TaskService<any>();
    const versions: Record<string, string> = {
      [NANO_FLAVOUR]: "1.0.0",
      [TYPEORM_FLAVOUR]: "1.0.0",
    };
    const app = await NestFactory.create(
      await DecafModule.forRootAsync({
        conf: [
          [
            NanoAdapter as any,
            {
              user: nanoResources.user,
              password: nanoResources.password,
              host: nanoResources.host,
              dbName: nanoResources.dbName,
              protocol: nanoResources.protocol,
            },
            NANO_FLAVOUR,
            new NoopTransformer(),
          ],
          [
            TypeORMAdapter as any,
            {
              type: "postgres",
              host,
              port,
              username: typeormResources.user,
              password: typeormResources.password,
              database: typeormResources.dbName,
              synchronize: "migration",
              logging: false,
            } as any,
            TYPEORM_FLAVOUR,
            new NoopTransformer(),
          ],
        ],
        autoControllers: true,
        autoServices: false,
      } as any),
      { logger: false }
    );

    try {
      await taskAdapter.initialize();
      await taskService.boot({
        adapter: taskAdapter,
        pollMsIdle: 10,
        pollMsBusy: 10,
        leaseMs: 500,
      } as any);
      const engine = taskService.client as TaskEngine<any>;
      await engine.start();

      await app.init();
      const adapters = app.get<any[]>(DECAF_ADAPTER_ID);
      const nano = adapters.find((a) => a.flavour === NANO_FLAVOUR);
      const typeorm = adapters.find((a) => a.flavour === TYPEORM_FLAVOUR);
      if (!nano || !typeorm) {
        throw new Error("failed to resolve live nano/typeorm adapters from nest");
      }

      await nano.client.bulk({
        docs: [
          withNanoTable(NANO_TABLE_A, { id: "np-1", name: "alice" }),
          withNanoTable(NANO_TABLE_B, { id: "nc-1", email: "a@x.dev" }),
        ],
      });
      await typeorm.client.query(
        `CREATE TABLE "${TYPEORM_TABLE_A}" ("id" character varying PRIMARY KEY, "body" character varying NOT NULL)`
      );
      await typeorm.client.query(
        `CREATE TABLE "${TYPEORM_TABLE_B}" ("id" character varying PRIMARY KEY, "key" character varying NOT NULL)`
      );
      await typeorm.client.query(
        `INSERT INTO "${TYPEORM_TABLE_A}" ("id","body") VALUES ($1,$2)`,
        ["tp-1", "prompt"]
      );
      await typeorm.client.query(
        `INSERT INTO "${TYPEORM_TABLE_B}" ("id","key") VALUES ($1,$2)`,
        ["tc-1", "cfg"]
      );

      const services = await MigrationService.migrateAdapters(
        [nano as any, typeorm as any],
        {
          taskMode: true,
          toVersion: TARGET_VERSION,
          taskService: taskService as any,
          handlers: {
            [NANO_FLAVOUR]: {
              retrieveLastVersion: async () => versions[NANO_FLAVOUR],
              setCurrentVersion: async (version) => {
                versions[NANO_FLAVOUR] = version;
              },
            },
            [TYPEORM_FLAVOUR]: {
              retrieveLastVersion: async () => versions[TYPEORM_FLAVOUR],
              setCurrentVersion: async (version) => {
                versions[TYPEORM_FLAVOUR] = version;
              },
            },
          },
        } as any
      );

      const queued = await taskService.select().execute();
      const migrationTasks = queued.filter(
        (task) => task.classification === "migration-composite"
      );
      expect(migrationTasks).toHaveLength(4);

      for (const service of services) {
        await expect(service.track()).rejects.toThrow("intentional failure");
        await service.retry();
        await service.track();
      }

      expect(versions[NANO_FLAVOUR]).toBe(TARGET_VERSION);
      expect(versions[TYPEORM_FLAVOUR]).toBe(TARGET_VERSION);

      const nanoA = await nano.client.get(`${NANO_TABLE_A}__np-1`);
      const nanoB = await nano.client.get(`${NANO_TABLE_B}__nc-1`);
      expect((nanoA as any).segment).toBe("retail");
      expect((nanoB as any).tier).toBe("gold");

      const rowA = await typeorm.client.query(
        `SELECT "category" FROM "${TYPEORM_TABLE_A}" WHERE "id" = $1`,
        ["tp-1"]
      );
      const rowB = await typeorm.client.query(
        `SELECT "scope" FROM "${TYPEORM_TABLE_B}" WHERE "id" = $1`,
        ["tc-1"]
      );
      expect(rowA[0].category).toBe("gen");
      expect(rowB[0].scope).toBe("system");
    } finally {
      await app.close().catch(() => undefined);
      await taskService.shutdown().catch(() => undefined);
      await taskAdapter.shutdown().catch(() => undefined);
      await cleanupTypeORMTestResources(typeormResources);
      await cleanupNanoTestResources(nanoResources);
    }
  });
});
