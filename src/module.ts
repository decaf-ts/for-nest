import { DynamicModule, ForwardReference, Module, Type } from "@nestjs/common";
import { DecafModuleOptions } from "./types";
import { DecafCoreModule } from "./core-module";
import { DecafModelModule } from "./decaf-model";

/**
 * @publicApi
 */
@Module({})
export class DecafModule {
  static async forRootAsync(
    options: DecafModuleOptions
  ): Promise<DynamicModule> {
    const { autoControllers } = options;

    const adapter = await DecafCoreModule.createAdapter(options);
    const flavour = adapter.flavour;

    const imports:
      | (
          | DynamicModule
          | Type<any>
          | Promise<DynamicModule>
          | ForwardReference<any>
        )[]
      | undefined = [DecafCoreModule.forRoot(options)];

    if (autoControllers) {
      imports.push(DecafModelModule.forRoot(flavour, options.handlers));
    }

    return {
      module: DecafModule,
      imports: imports,
    };
  }
}
