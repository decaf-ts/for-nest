import { DynamicModule, ForwardReference, Module, Type } from "@nestjs/common";
import { DecafModuleOptions } from "./types";
import { DecafCoreModule } from "./core-module";
import { Adapter } from "@decaf-ts/core";
import { getModuleFor } from "./decaf-model/index";

/**
 * @publicApi
 */
@Module({})
export class DecafModule {
  static async forRootAsync(
    options: DecafModuleOptions
  ): Promise<DynamicModule> {
    const { autoControllers, autoServices, handlers } = options;

    const adapters: Adapter<any, any, any, any>[] =
      await DecafCoreModule.bootPersistence(options);
    const flavours = adapters.map((adapter) => adapter.flavour);

    const imports:
      | (
          | DynamicModule
          | Type<any>
          | Promise<DynamicModule>
          | ForwardReference<any>
        )[]
      | undefined = [DecafCoreModule.forRoot(options)];

    if (autoControllers) {
      flavours.forEach((flavour) => {
        imports.push(
          getModuleFor(flavour).forRoot(flavour, {
            autoServices,
            handlers,
          })
        );
      });
    }

    return {
      module: DecafModule,
      imports: imports,
    };
  }
}
