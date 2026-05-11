import { AbsMigration, migration } from "@decaf-ts/core/migrations";
import {
  addAndBackfillNonNullColumn,
  LIVE_MIGRATION_VERSION,
  NANO_COLLECTION,
  TYPEORM_TABLE,
} from "./resources";

const NANO_MIGRATION_REF = "1.1.0-nest-live-nano";
const TYPEORM_MIGRATION_REF = "1.1.0-nest-live-typeorm";
const NANO_DEFAULT = "nano-default";
const TYPEORM_DEFAULT = "typeorm-default";

@migration(NANO_MIGRATION_REF, LIVE_MIGRATION_VERSION, "nano")
class NestCliNanoMigration extends AbsMigration<any> {
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
    const prefix = `${NANO_COLLECTION}__`;
    const all = await qr.list({ include_docs: true });
    const docs = (all.rows || [])
      .map((row: any) => row.doc)
      .filter((doc: any) => doc && typeof doc._id === "string")
      .filter((doc: any) => doc._id.startsWith(prefix))
      .map((doc: any) => ({
        ...doc,
        migrationRequired: doc.migrationRequired || NANO_DEFAULT,
      }));

    if (docs.length) await qr.bulk({ docs });
  }
}

@migration(TYPEORM_MIGRATION_REF, LIVE_MIGRATION_VERSION, "type-orm")
class NestCliTypeormMigration extends AbsMigration<any> {
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
      TYPEORM_TABLE,
      "migrationRequired",
      TYPEORM_DEFAULT
    );
  }
}
