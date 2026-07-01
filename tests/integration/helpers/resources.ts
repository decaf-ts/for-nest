import { ConflictError, InternalError, NotFoundError } from "@decaf-ts/db-decorators";
import { NanoAdapter } from "@decaf-ts/for-nano";
import { TypeORMAdapter } from "@decaf-ts/for-typeorm";

export const LIVE_MIGRATION_VERSION = "1.1.0-nest-live";
export const NANO_COLLECTION = "for_nest_migration_docs";
export const TYPEORM_TABLE = "for_nest_migration_rows";

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

const adminConfig = {
  type: "postgres" as const,
  username: pgAdminUser,
  password: pgAdminPassword,
  database: pgAdminDatabase,
  host: pgHost,
  port: pgPort,
};

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function waitForCleanup(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function waitForNanoAccess(
  dbName: string,
  user: string,
  password: string,
  host: string,
  protocol: "http" | "https",
  timeoutMs = 15000,
  intervalMs = 250
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const probe = NanoAdapter.connect(user, password, host, protocol);
    try {
      await probe.db.use(dbName).get("_security");
      return;
    } catch {
      await waitForCleanup(intervalMs);
    } finally {
      NanoAdapter.closeConnection(probe);
    }
  }
  throw new InternalError(`Timed out waiting for Nano access to ${dbName}`);
}

export type NanoResources = {
  connection: any;
  dbName: string;
  user: string;
  password: string;
  host: string;
  protocol: "http" | "https";
};

export async function createNanoTestResources(prefix: string): Promise<NanoResources> {
  const suffix = randomSuffix();
  const dbName = `${prefix}_${suffix}`;
  const user = `${prefix}_user_${suffix}`;
  const password = `${user}_pw`;
  const connection = NanoAdapter.connect(nanoAdminUser, nanoAdminPassword, nanoHost, nanoProtocol);
  await NanoAdapter.createDatabase(connection, dbName).catch((e: any) => {
    if (!(e instanceof ConflictError)) throw new InternalError(String(e));
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch((e: any) => {
    if (!(e instanceof ConflictError)) throw new InternalError(String(e));
  });
  await waitForNanoAccess(dbName, user, password, nanoHost, nanoProtocol);
  return {
    connection,
    dbName,
    user,
    password,
    host: nanoHost,
    protocol: nanoProtocol,
  };
}

export async function cleanupNanoTestResources(resources: NanoResources) {
  try {
    await NanoAdapter.deleteDatabase(resources.connection, resources.dbName);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw new InternalError(String(e));
  }
  await waitForCleanup(nanoCleanupDelayMs);
  try {
    await NanoAdapter.deleteUser(resources.connection, resources.dbName, resources.user);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw new InternalError(String(e));
  } finally {
    NanoAdapter.closeConnection(resources.connection);
  }
  await waitForCleanup(nanoCleanupDelayMs);
}

export type TypeormResources = {
  dbName: string;
  user: string;
  password: string;
};

export async function createTypeORMTestResources(prefix: string): Promise<TypeormResources> {
  const suffix = randomSuffix();
  const normalizedPrefix = prefix.replace(/[^a-zA-Z0-9_]/g, "_");
  const dbName = `${normalizedPrefix}_${suffix}`;
  const user = `${normalizedPrefix}_user_${suffix}`;
  const password = `${user}_pw`;

  const adminConnection = await TypeORMAdapter.connect(adminConfig);
  try {
    await TypeORMAdapter.createDatabase(adminConnection, dbName);
  } catch (e: any) {
    if (!(e instanceof ConflictError)) throw new InternalError(String(e));
  } finally {
    await adminConnection.destroy();
  }

  const adminDbConfig = { ...adminConfig, database: dbName };
  const adminDbConnection = await TypeORMAdapter.connect(adminDbConfig);
  try {
    await TypeORMAdapter.createUser(adminDbConnection, dbName, user, password);
    await TypeORMAdapter.createNotifyFunction(adminDbConnection, user);
  } finally {
    await adminDbConnection.destroy();
  }

  return { dbName, user, password };
}

export async function cleanupTypeORMTestResources(resources: TypeormResources) {
  const adminConnection = await TypeORMAdapter.connect(adminConfig);
  try {
    await TypeORMAdapter.deleteDatabase(adminConnection, resources.dbName, resources.user);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw new InternalError(String(e));
  }
  await waitForCleanup(pgCleanupDelayMs);
  try {
    await TypeORMAdapter.deleteUser(adminConnection, resources.user, pgAdminUser);
  } catch (e: any) {
    if (!(e instanceof NotFoundError)) throw new InternalError(String(e));
  } finally {
    await adminConnection.destroy();
  }
  await waitForCleanup(pgCleanupDelayMs);
}

export async function seedLegacyNanoState(resources: NanoResources) {
  const db = resources.connection.db.use(resources.dbName);
  await db.bulk({
    docs: [
      {
        _id: `${NANO_COLLECTION}__legacy`,
        id: "legacy",
        name: "legacy",
      },
    ],
  });
}

export async function seedLegacyTypeormState(resources: TypeormResources) {
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
      `CREATE TABLE "${TYPEORM_TABLE}" ("id" character varying PRIMARY KEY, "name" character varying NOT NULL)`
    );
    await client.query(
      `INSERT INTO "${TYPEORM_TABLE}" ("id", "name") VALUES ($1, $2)`,
      ["cli-1", "cli"]
    );
  } finally {
    await client.destroy();
  }
}

export async function addAndBackfillNonNullColumn(
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
  } catch (e) {
    await queryRunner.rollbackTransaction();
    throw new InternalError(String(e));
  } finally {
    await queryRunner.release();
  }
}
