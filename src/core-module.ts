import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
  Scope,
} from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import type { DecafModuleOptions } from "./types";
import { DECAF_ADAPTER_ID, DECAF_MODULE_OPTIONS } from "./constants";
import { FactoryProvider } from "@nestjs/common/interfaces/modules/provider.interface";
import { Adapter, PersistenceService } from "@decaf-ts/core";
import { Logger, Logging } from "@decaf-ts/logging";
import { InternalError } from "@decaf-ts/db-decorators";

@Global()
@Module({})
export class DecafCoreModule<CONF, ADAPTER extends Adapter<CONF, any, any, any>>
  implements OnApplicationShutdown
{
  private static _logger: Logger;

  private static _persistence?: PersistenceService<any>;

  protected static get persistence(): PersistenceService<any> {
    if (!this._persistence)
      throw new InternalError("Persistence service not initialized");
    return this._persistence;
  }

  private static _adapterInstance: Adapter<any, any, any, any> | null = null;

  protected static get log(): Logger {
    if (!this._logger) this._logger = Logging.for(DecafCoreModule);
    return this._logger;
  }

  constructor(
    @Inject(DECAF_MODULE_OPTIONS)
    private readonly options: DecafModuleOptions<CONF, ADAPTER>,
    private readonly moduleRef: ModuleRef
  ) {}

  static async bootPersistence(
    options: DecafModuleOptions
  ): Promise<Adapter<any, any, any, any>[]> {
    const log = this.log.for(this.bootPersistence);

    if (!this._persistence) {
      this._persistence = new PersistenceService();
      await this._persistence.boot(options.conf);
      log.info("persistence layer created successfully!");
    }

    return this.persistence.client;

    //
    // if (!this._adapterInstance) {
    //   log.info("Creating adapter instance...");
    //   this._adapterInstance = new options.adapter(options.conf, options.alias);
    //   try {
    //     await this._adapterInstance.initialize();
    //   } catch (e: unknown) {
    //     log.error(`Failed to initialized adapter`);
    //     throw e;
    //   }
    //   log.info("Adapter instance created successfully!");
    // }
    // return this.persistence;
  }

  static forRoot(options: DecafModuleOptions): DynamicModule {
    const typeOrmModuleOptions = {
      provide: DECAF_MODULE_OPTIONS,
      useValue: options,
    };

    const adapter: FactoryProvider<any> = {
      useFactory: async (opts: DecafModuleOptions) => {
        return DecafCoreModule.bootPersistence(opts);
      },
      provide: DECAF_ADAPTER_ID,
      durable: true,
      scope: Scope.DEFAULT,
      inject: [DECAF_MODULE_OPTIONS],
    };

    const providers = [adapter, typeOrmModuleOptions];
    const exports = [adapter];

    return {
      module: DecafCoreModule,
      providers,
      exports,
    };
  }

  async onApplicationShutdown(): Promise<void> {
    const log = DecafCoreModule.log.for(this.onApplicationShutdown);
    const adapter = this.moduleRef.get<ADAPTER>(DECAF_ADAPTER_ID);
    try {
      if (adapter) {
        log.info("Shutting down");
        await adapter.shutdown();
        DecafCoreModule._adapterInstance = null;
      }
    } catch (e: unknown) {
      log.error(`Failed to shutdown application`, e as Error);
    }
  }
}
