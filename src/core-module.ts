import {
  DynamicModule,
  Global,
  Inject,
  Module,
  OnApplicationShutdown,
  Scope,
} from "@nestjs/common";
import { APP_INTERCEPTOR, ModuleRef } from "@nestjs/core";
import type { DecafModuleOptions } from "./types";
import {
  DECAF_ADAPTER_ID,
  DECAF_HANDLERS,
  DECAF_MODULE_OPTIONS,
} from "./constants";
import { FactoryProvider } from "@nestjs/common/interfaces/modules/provider.interface";
import { Adapter, PersistenceService } from "@decaf-ts/core";
import { Logger, Logging } from "@decaf-ts/logging";
import { InternalError } from "@decaf-ts/db-decorators";
import {
  AuthInterceptor,
  DecafRequestHandlerInterceptor,
  RequestToContextTransformer,
  requestToContextTransformer,
} from "./interceptors";
import { DecafHandlerExecutor, DecafRequestContext } from "./request";
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

  static forRoot(options: DecafModuleOptions): DynamicModule {
    const log = this.log.for(this.forRoot);
    return {
      module: DecafCoreModule,
      providers: [
        { provide: DECAF_MODULE_OPTIONS, useValue: options },
        { provide: DECAF_ADAPTER_ID, useValue: this.persistence.client },
        {
          provide: DECAF_HANDLERS,
          useFactory: () =>
            options.handlers?.map((H) => {
              log.info(`Registered request handler: ${H.name}`);
              return new H();
            }) ?? [],
        },
        AuthInterceptor,
        {
          provide: APP_INTERCEPTOR,
          useExisting: AuthInterceptor,
        },
        DecafRequestContext,
        DecafHandlerExecutor,
        {
          provide: APP_INTERCEPTOR,
          useClass: DecafRequestHandlerInterceptor,
        },
      ],
      exports: [
        DECAF_MODULE_OPTIONS,
        DECAF_ADAPTER_ID,
        DECAF_HANDLERS,
        DecafRequestContext,
        DecafHandlerExecutor,
      ],
    };
  }

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
        const possibleTransf = c.slice(2, c.length);
        let transformer = possibleTransf.pop();
        if (
          !transformer ||
          !(transformer as RequestToContextTransformer<any>).from
        ) {
          const contr = Adapter.transformerFor(clients[i].flavour);
          if (!contr)
            throw new InternalError(
              `No transformer found for flavour ${clients[i].flavour}. you should either @requestToContextTransformer or provide a transformer in the config`
            );
          try {
            transformer = (contr as RequestToContextTransformer<any>).from
              ? contr
              : new (contr as Constructor<RequestToContextTransformer<any>>)();
          } catch (e: unknown) {
            throw new InternalError(
              `Failed to boot transformer for ${clients[i].flavour}: ${e}`
            );
          }
        }
        requestToContextTransformer(clients[i].flavour)(transformer);
      }
      log.info("persistence layer created successfully!");

      if (options.initialization) {
        try {
          await options.initialization();
        } catch (e: unknown) {
          throw new InternalError(`Failed to initialize application: ${e}`);
        }
      }
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
