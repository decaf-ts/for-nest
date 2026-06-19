import "../../src/decoration";
import "../../src/overrides";

import { NestFactory } from "@nestjs/core";
import { Adapter, column, pk, table } from "@decaf-ts/core";
import {
  AbsMigration,
  migration,
  MigrationService,
} from "@decaf-ts/core/migrations";
import { RamAdapter } from "@decaf-ts/core/ram";
import { TaskService } from "@decaf-ts/core/tasks";
import { uses } from "@decaf-ts/decoration";
import { model, Model, required } from "@decaf-ts/decorator-validation";
import { ConflictError, NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "@decaf-ts/for-nano";
import { TypeORMAdapter } from "@decaf-ts/for-typeorm";
import { DataSourceOptions } from "typeorm/data-source/DataSourceOptions";
import { DecafCoreModule } from "../../src/core-module";
import { DecafModule } from "../../src/module";
import {
  RequestToContextTransformer,
  requestToContextTransformer,
} from "../../src/interceptors/context";
import { DECAF_ADAPTER_ID } from "../../src/constants";

jest.setTimeout(240000);

type NanoResources = Awaited<ReturnType<typeof createNanoTestResources>>;
type TypeormResources = Awaited<ReturnType<typeof createTypeORMTestResources>>;

const executedSteps: string[] = [];

const nanoAdminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
const nanoAdminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
const nanoHost = process.env.NANO_HOST || "localhost:10010";
const nanoProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";
const nanoCleanupDelayMs = Number(process.env.NANO_CLEANUP_DELAY_MS || "250");

const pgAdminUser = process.env.TYPEORM_ADMIN_USER || "alfred";
const pgAdminPassword = process.env.TYPEORM_ADMIN_PASSWORD || "password";
const pgAdminDatabase = process.env.TYPEORM_ADMIN_DATABASE || "alfred";
const pgHost = process.env.TYPEORM_HOST || "localhost";
const pgPort = Number(process.env.TYPEORM_PORT || "5432");
const pgCleanupDelayMs = Number(process.env.TYPEORM_CLEANUP_DELAY_MS || "250");

class NestNanoAlphaV1 {}
class NestNanoBetaV1 {}
class NestTypeormAlphaV1 {}
class NestTypeormBetaV1 {}

@uses("nano")
@table("nest_task_nano_alpha")
@model()
class NestNanoAlphaV2 extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @column()
  @required()
  name!: string;

  @column()
  @required()
  migrationRequired!: string;

  constructor(data?: Partial<NestNanoAlphaV2>) {
    super(data as any);
  }
}

@uses("nano")
@table("nest_task_nano_beta")
@model()
class NestNanoBetaV2 extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @column()
  @required()
  title!: string;

  @column()
  @required()
  migrationRequired!: string;

  constructor(data?: Partial<NestNanoBetaV2>) {
    super(data as any);
  }
}

@uses("typeorm")
@table("nest_task_typeorm_alpha")
@model()
class NestTypeormAlphaV2 extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @column()
  @required()
  name!: string;

  @column()
  @required()
  migrationRequired!: string;

  constructor(data?: Partial<NestTypeormAlphaV2>) {
    super(data as any);
  }
}

@uses("typeorm")
@table("nest_task_typeorm_beta")
@model()
class NestTypeormBetaV2 extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @column()
  @required()
  title!: string;

  @column()
  @required()
  migrationRequired!: string;

  constructor(data?: Partial<NestTypeormBetaV2>) {
    super(data as any);
  }
}

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
  return { connection, dbName, user, password };
}

async function cleanupNanoTestResources(resources: NanoResources) {
  const { connection, dbName, user } = resources;
  try {
    await NanoAdapter.deleteDatabase(connection, dbName);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  await waitForCleanup(nanoCleanupDelayMs);
  try {
    await NanoAdapter.deleteUser(connection, dbName, user);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  } finally {
    NanoAdapter.closeConnection(connection);
  }
}

const pgAdminConfig: DataSourceOptions = {
  type: "postgres",
  username: pgAdminUser,
  password: pgAdminPassword,
  database: pgAdminDatabase,
  host: pgHost,
  port: pgPort,
};

async function createTypeORMTestResources(prefix: string) {
  const suffix = randomSuffix();
  const dbName = `${prefix}_${suffix}`;
  const user = `${prefix}_user_${suffix}`;
  const password = `${user}_pw`;

  const adminConnection = await TypeORMAdapter.connect(pgAdminConfig);
  try {
    await TypeORMAdapter.createDatabase(adminConnection, dbName);
  } catch (e: any) {
    if (!(e instanceof ConflictError)) throw e;
  } finally {
    await adminConnection.destroy();
  }

  const adminDbConfig: DataSourceOptions = {
    ...pgAdminConfig,
    database: dbName,
  };
  const adminDbConnection = await TypeORMAdapter.connect(adminDbConfig);
  try {
    await TypeORMAdapter.createUser(adminDbConnection, dbName, user, password);
    await TypeORMAdapter.createNotifyFunction(adminDbConnection, user);
  } finally {
    await adminDbConnection.destroy();
  }

  return { dbName, user, password };
}

async function cleanupTypeORMTestResources(resources: TypeormResources) {
  const adminConnection = await TypeORMAdapter.connect(pgAdminConfig);
  try {
    await TypeORMAdapter.deleteDatabase(
      adminConnection,
      resources.dbName,
      resources.user
    );
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  await waitForCleanup(pgCleanupDelayMs);
  try {
    await TypeORMAdapter.deleteUser(
      adminConnection,
      resources.user,
      pgAdminUser
    );
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw e;
  } finally {
    await adminConnection.destroy();
  }
  await waitForCleanup(pgCleanupDelayMs);
}

async function seedLegacyNanoState(resources: NanoResources) {
  const db = resources.connection.db.use(resources.dbName);
  await db.bulk({
    docs: [
      {
        _id: "nest_task_nano_alpha__n-a-1",
        id: "n-a-1",
        name: "nA",
      },
      {
        _id: "nest_task_nano_beta__n-b-1",
        id: "n-b-1",
        title: "nB",
      },
    ],
  });
}

async function seedLegacyTypeormState(resources: TypeormResources) {
  const client = await TypeORMAdapter.connect({
    type: "postgres",
    host: pgHost,
    port: pgPort,
    username: resources.user,
    password: resources.password,
    database: resources.dbName,
  });
  try {
    await client.query(
      'CREATE TABLE "nest_task_typeorm_alpha" ("id" character varying PRIMARY KEY, "name" character varying NOT NULL)'
    );
    await client.query(
      'CREATE TABLE "nest_task_typeorm_beta" ("id" character varying PRIMARY KEY, "title" character varying NOT NULL)'
    );
    await client.query(
      'INSERT INTO "nest_task_typeorm_alpha" ("id", "name") VALUES ($1, $2)',
      ["t-a-1", "tA"]
    );
    await client.query(
      'INSERT INTO "nest_task_typeorm_beta" ("id", "title") VALUES ($1, $2)',
      ["t-b-1", "tB"]
    );
  } finally {
    await client.destroy();
  }
}

@requestToContextTransformer("nano")
class NestNanoTransformer extends RequestToContextTransformer<any> {
  async from(): Promise<any> {
    return {};
  }
}

@requestToContextTransformer("typeorm")
class NestTypeormTransformer extends RequestToContextTransformer<any> {
  async from(): Promise<any> {
    return {};
  }
}

class MigrationModeTypeormAdapter extends TypeORMAdapter {
  constructor(conf: any, alias?: string) {
    const normalized =
      conf?.synchronize === "migration"
        ? {
            ...conf,
            synchronize: false,
            migrationsRun: true,
          }
        : conf;
    super(normalized, alias);
  }
}

@migration("14.8.0-nest-task-nano-alpha", "14.8.0", "nano")
class NestTaskNanoAlphaMigration extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }

  async migrate(qr: any): Promise<void> {
    const pref = "nest_task_nano_alpha__";
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && typeof doc._id === "string")
      .filter((doc: any) => doc._id.startsWith(pref))
      .map((doc: any) => ({
        ...doc,
        migrationRequired: doc.migrationRequired || "nano-default",
      }));

    if (docs.length) {
      await qr.bulk({ docs });
    }

    executedSteps.push("nano-alpha");
  }
}

@migration("14.8.1-nest-task-nano-beta", "14.8.1", "nano")
class NestTaskNanoBetaMigration extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }

  async migrate(qr: any): Promise<void> {
    const pref = "nest_task_nano_beta__";
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && typeof doc._id === "string")
      .filter((doc: any) => doc._id.startsWith(pref))
      .map((doc: any) => ({
        ...doc,
        migrationRequired: doc.migrationRequired || "nano-default",
      }));

    if (docs.length) {
      await qr.bulk({ docs });
    }

    executedSteps.push("nano-beta");
  }
}

async function addAndBackfillNonNullColumn(
  dataSource: any,
  tableName: string,
  columnName: string,
  value: string
): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  try {
    await queryRunner.query(
      `ALTER TABLE \"${tableName}\" ADD COLUMN \"${columnName}\" character varying`
    );
    await queryRunner.query(
      `UPDATE \"${tableName}\" SET \"${columnName}\" = $1 WHERE \"${columnName}\" IS NULL`,
      [value]
    );
    await queryRunner.query(
      `ALTER TABLE \"${tableName}\" ALTER COLUMN \"${columnName}\" SET NOT NULL`
    );
    await queryRunner.commitTransaction();
  } catch (e: unknown) {
    await queryRunner.rollbackTransaction();
    throw e;
  } finally {
    await queryRunner.release();
  }
}

@migration("14.8.0-nest-task-typeorm-alpha", "14.8.0", "type-orm")
class NestTaskTypeormAlphaMigration extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }

  async migrate(qr: any): Promise<void> {
    await addAndBackfillNonNullColumn(
      qr,
      "nest_task_typeorm_alpha",
      "migrationRequired",
      "typeorm-default"
    );
    executedSteps.push("typeorm-alpha");
  }
}

@migration("14.8.1-nest-task-typeorm-beta", "14.8.1", "type-orm")
class NestTaskTypeormBetaMigration extends AbsMigration<any> {
  protected getQueryRunner(conn: any): any {
    return conn;
  }

  async up(): Promise<void> {
    return;
  }

  async down(): Promise<void> {
    return;
  }

  async migrate(qr: any): Promise<void> {
    await addAndBackfillNonNullColumn(
      qr,
      "nest_task_typeorm_beta",
      "migrationRequired",
      "typeorm-default"
    );
    executedSteps.push("typeorm-beta");
  }
}

describe.skip("for-nest task-based migrations with real nano+typeorm adapters", () => {
  let nanoResources: NanoResources | undefined;
  let typeormResources: TypeormResources | undefined;

  beforeAll(async () => {
    nanoResources = await createNanoTestResources("nest_task_migration");
    typeormResources = await createTypeORMTestResources("nest_task_migration");
  });

  afterAll(async () => {
    if (typeormResources) await cleanupTypeORMTestResources(typeormResources);
    if (nanoResources) await cleanupNanoTestResources(nanoResources);
  });

  beforeEach(() => {
    void NestNanoAlphaV1;
    void NestNanoBetaV1;
    void NestTypeormAlphaV1;
    void NestTypeormBetaV1;
    executedSteps.length = 0;
  });

  afterEach(() => {
    (DecafCoreModule as any)._persistence = undefined;
  });

  it("runs task-based migrations across nano and typeorm without mocks", async () => {
    if (!nanoResources || !typeormResources)
      throw new Error("test resources are not initialized");

    await seedLegacyNanoState(nanoResources);
    await seedLegacyTypeormState(typeormResources);

    (DecafCoreModule as any)._persistence = undefined;

    const typeormInputConfig = {
      type: "postgres",
      host: pgHost,
      port: pgPort,
      username: typeormResources.user,
      password: typeormResources.password,
      database: typeormResources.dbName,
      synchronize: "migration",
      logging: false,
    } as any;

    const module = await DecafModule.forRootAsync({
      conf: [
        [
          NanoAdapter as any,
          {
            user: nanoResources.user,
            password: nanoResources.password,
            host: nanoHost,
            protocol: nanoProtocol,
            dbName: nanoResources.dbName,
          },
          new NestNanoTransformer(),
        ],
        [
          MigrationModeTypeormAdapter as any,
          typeormInputConfig,
          new NestTypeormTransformer(),
        ],
      ],
      autoControllers: false,
      autoServices: false,
    });

    const app = await NestFactory.create(module, { logger: false });
    const taskAdapter = new RamAdapter({}, "nest-task-engine-ram");
    const taskService = new TaskService<any>();

    try {
      await app.init();

      const adapters = app.get<Adapter<any, any, any, any>[]>(DECAF_ADAPTER_ID);
      const nanoAdapter = adapters.find(
        (adapter) =>
          adapter.flavour === "nano" &&
          (adapter.config as any)?.dbName === nanoResources.dbName
      );
      const typeormAdapter = adapters.find(
        (adapter) =>
          adapter.flavour === "type-orm" &&
          (adapter.config as any)?.database === typeormResources.dbName
      );

      if (!nanoAdapter || !typeormAdapter) {
        throw new Error(
          "unable to resolve nano/typeorm adapters from Nest module"
        );
      }

      await taskAdapter.initialize();
      await taskService.boot({
        adapter: taskAdapter,
        pollMsBusy: 5,
        pollMsIdle: 5,
        autoShutdown: { enabled: false },
      } as any);

      const versions: Record<string, string> = {
        nano: "14.7.9",
        "type-orm": "14.7.9",
      };

      const migrations = await MigrationService.migrateAdapters(
        [nanoAdapter as any, typeormAdapter as any],
        {
          taskMode: true,
          toVersion: "14.8.1",
          taskService: {
            client: (taskService as any).client,
            push: async (task: any) => taskService.push(task, false as any),
            track: async (id: string) => taskService.track(id),
          } as any,
          handlers: {
            nano: {
              retrieveLastVersion: async () => versions.nano,
              setCurrentVersion: async (version) => {
                versions.nano = version;
              },
            },
            "type-orm": {
              retrieveLastVersion: async () => versions["type-orm"],
              setCurrentVersion: async (version) => {
                versions["type-orm"] = version;
              },
            },
          },
        }
      );

      const queued = await taskService.select().execute();
      const migrationCompositeTasks = queued.filter(
        (task) => task.classification === "migration-composite"
      );

      expect(migrationCompositeTasks).toHaveLength(4);
      const refs = migrationCompositeTasks
        .flatMap((task) => task.steps || [])
        .map((step) => (step.input as any)?.reference)
        .sort();
      expect(refs).toEqual(
        [
          "14.8.0-nest-task-nano-alpha",
          "14.8.1-nest-task-nano-beta",
          "14.8.0-nest-task-typeorm-alpha",
          "14.8.1-nest-task-typeorm-beta",
        ].sort()
      );

      for (const migration of migrations) {
        await migration.track();
      }

      expect(executedSteps.sort()).toEqual(
        ["nano-alpha", "nano-beta", "typeorm-alpha", "typeorm-beta"].sort()
      );
      expect(versions.nano).toBe("14.8.1");
      expect(versions["type-orm"]).toBe("14.8.1");
      expect(typeormInputConfig.synchronize).toBe("migration");

      const nanoDb = nanoResources.connection.db.use(nanoResources.dbName);
      const [nanoAlpha, nanoBeta] = await Promise.all([
        nanoDb.get("nest_task_nano_alpha__n-a-1"),
        nanoDb.get("nest_task_nano_beta__n-b-1"),
      ]);
      expect((nanoAlpha as any).migrationRequired).toBe("nano-default");
      expect((nanoBeta as any).migrationRequired).toBe("nano-default");

      const typeormRowsAlpha = await typeormAdapter.client.query(
        'SELECT id, "migrationRequired" FROM "nest_task_typeorm_alpha" WHERE id = $1',
        ["t-a-1"]
      );
      const typeormRowsBeta = await typeormAdapter.client.query(
        'SELECT id, "migrationRequired" FROM "nest_task_typeorm_beta" WHERE id = $1',
        ["t-b-1"]
      );
      expect(typeormRowsAlpha[0].migrationRequired).toBe("typeorm-default");
      expect(typeormRowsBeta[0].migrationRequired).toBe("typeorm-default");

      const alphaCol = await typeormAdapter.client.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'nest_task_typeorm_alpha' AND column_name = 'migrationRequired'`
      );
      const betaCol = await typeormAdapter.client.query(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'nest_task_typeorm_beta' AND column_name = 'migrationRequired'`
      );

      expect(alphaCol[0].is_nullable).toBe("NO");
      expect(betaCol[0].is_nullable).toBe("NO");
    } finally {
      await taskService.shutdown().catch(() => undefined);
      await taskAdapter.shutdown().catch(() => undefined);
      await app.close().catch(() => undefined);
    }
  });
});
