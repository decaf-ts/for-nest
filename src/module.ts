import { DynamicModule, Module } from "@nestjs/common";
import { DecafModuleOptions } from "./types";
import { DecafCoreModule } from "./core-module";

/**
 * @publicApi
 */
@Module({})
export class DecafModule {
  static forRoot(options: DecafModuleOptions): DynamicModule {
    return {
      module: DecafModule,
      imports: [DecafCoreModule.forRoot(options)],
    };
  }
}
