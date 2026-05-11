/**
 * @module for-nest/migrations
 * @description Migration orchestration module for NestJS
 */

import { DynamicModule, Global, Inject, Module } from "@nestjs/common";
import { InternalError } from "@decaf-ts/db-decorators";
import { Logging } from "@decaf-ts/logging";
import { DECAF_ADAPTER_ID } from "../constants";
import { Adapter } from "@decaf-ts/core";

const logger = Logging.for("DecafMigrationModule");

/**
 * @description Migration module for NestJS
 * @summary Provides migration orchestration capabilities
 * @module for-nest/migrations
 */
@Global()
@Module({
  providers: [
    {
      provide: "MIGRATION_ADAPTERS",
      useFactory: (adapters: Adapter<any, any, any, any>[]) => adapters,
      inject: [DECAF_ADAPTER_ID],
    },
  ],
  exports: ["MIGRATION_ADAPTERS"],
})
export class DecafMigrationModule {
  static forRoot(): DynamicModule {
    return {
      module: DecafMigrationModule,
    };
  }

  static async migrate(
    config?: any,
    adapters?: Adapter<any, any, any, any>[]
  ): Promise<any[]> {
    const log = logger.for(this.migrate);
    
    if (!adapters || adapters.length === 0) {
      throw new InternalError(
        "No adapters provided. Make sure DecafCoreModule is configured and adapters are available."
      );
    }

    log.info(`Running migrations with config: ${JSON.stringify(config)}`);

    // @ts-ignore - MigrationService is imported from @decaf-ts/core but not exported via subpath
    return (await import("@decaf-ts/core/migrations")).MigrationService.migrateAdapters(adapters, config || {});
  }
}
