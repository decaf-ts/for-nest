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
import { Adapter } from "@decaf-ts/core";
import { LoggedClass } from "@decaf-ts/logging/lib/LoggedClass";

@Global()
@Module({})
export class DecafCoreModule<
    CONF,
    ADAPTER extends Adapter<CONF, any, any, any, any>,
  >
  extends LoggedClass
  implements OnApplicationShutdown
{
  constructor(
    @Inject(DECAF_MODULE_OPTIONS)
    private readonly options: DecafModuleOptions<CONF, ADAPTER>,
    private readonly moduleRef: ModuleRef
  ) {
    super();
  }

  static forRoot(options: DecafModuleOptions): DynamicModule {
    const typeOrmModuleOptions = {
      provide: DECAF_MODULE_OPTIONS,
      useValue: options,
    };

    const adapter: FactoryProvider<any> = {
      useFactory: async (opts: DecafModuleOptions) => {
        return new opts.adapter(opts.conf, opts.alias);
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
    const adapter = this.moduleRef.get<ADAPTER>(DECAF_ADAPTER_ID);
    try {
      if (adapter) {
        this.log.info("Shutting down");
        await adapter.shutdown();
      }
    } catch (e: unknown) {
      this.log.error(`Failed to shutdown application`, e as Error);
    }
  }
}
