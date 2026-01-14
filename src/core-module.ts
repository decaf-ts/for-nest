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
import { Metadata } from "@decaf-ts/decoration";
import {
  RequestToContextTransformer,
  requestToContextTransformer,
} from "./interceptors/context";
import { Constructor } from "@decaf-ts/decoration";

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
      const trimmed = options.conf.map(([contr, cfg, ...args]) => {
        const possible = args.pop();
        if (!possible) return [contr, cfg];
        return [contr, cfg, ...args];
      });
      this._persistence = new PersistenceService();
      await this._persistence.boot(trimmed);
      const clients = this._persistence.client;
      for (let i = 0; i < clients.length; i++) {
        const c = options.conf[i];
        let [, , transformer] = c;
        if (!transformer) {
          const contr = Adapter.transformerFor(clients[i].flavour);
          if (!contr)
            throw new InternalError(
              `No transformer found for flavour ${clients[i].flavour}. you should either @requestToContextTransformer or provide a transformer in the config`
            );
          transformer =
            contr instanceof RequestToContextTransformer ? contr : new contr();
        }
        requestToContextTransformer(clients[i].flavour)(transformer);
      }
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
    const adapters: Adapter<any, any, any, any>[] =
      this.moduleRef.get<any>(DECAF_ADAPTER_ID);
    for (const adapter of adapters)
      try {
        if (adapter) {
          log.info(`Shutting down ${adapter.toString()}`);
          await adapter.shutdown();
        }
      } catch (e: unknown) {
        log.error(`Failed to shutdown application`, e as Error);
      }
  }
}
