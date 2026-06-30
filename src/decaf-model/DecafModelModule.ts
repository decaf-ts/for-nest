import { DynamicModule, Module, Provider } from "@nestjs/common";
import { Adapter, ModelService } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";
import { FromModelController } from "./FromModelController";
import { DecafModuleOptions } from "../types";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Metadata } from "@decaf-ts/decoration";
import { DECAF_EXPOSE } from "../constants";
import type { ModelControllerFactoryConfig } from "@decaf-ts/for-http/server";

export function getModuleFor(flavour: string) {
  @Module({})
  class DecafModelModule {
    static readonly log = Logging.for(DecafModelModule.name).for(flavour);

    static createModelServices<T extends Model<boolean>>(
      models: ModelConstructor<T>[]
    ): Provider[] {
      return models.map((model) => ({
        provide: `${model.name}Service`,
        useFactory: () => ModelService.forModel(model as any),
      }));
    }

    static isExposed(
      model: ModelConstructor<any>,
      exposure?: Record<string, boolean | string[]>
    ): boolean {
      const override = exposure?.[model.name];
      const value =
        typeof override !== "undefined"
          ? override
          : Metadata.get(model, Metadata.key(DECAF_EXPOSE));

      if (typeof value === "undefined") return true;
      if (value === true) return true;
      if (Array.isArray(value)) return value.includes(flavour);
      return false;
    }

    static forRoot(
      flavour: string,
      options: Partial<DecafModuleOptions> = {}
    ): DynamicModule {
      const log = this.log.for(this.forRoot);
      log.info(`Generating controllers for flavour...`);

      const trackedModels = Adapter.models(flavour).filter((model) =>
        this.isExposed(model, options.controllerExposure)
      );

      // Controllers always rely on a backing ModelService, even when Nest providers
      // are not auto-registered. Warm the singleton registry here so shutdown can
      // see the live services created for the generated controllers.
      for (const model of trackedModels) ModelService.forModel(model as any);

      let modelServices: Provider[] = [];
      if (options.autoServices) {
        log.info("Auto-services enabled. Initializing service generation.");
        modelServices = this.createModelServices(trackedModels);
        log.info(
          `Auto-services completed. ${modelServices.length} services initialized.`
        );
      }

      const globalDefaults: Partial<ModelControllerFactoryConfig> = {};
      if (options.aggregations === false) {
        globalDefaults.allowGroupingQueries = false;
      }

      const controllers = trackedModels.map((model) =>
        FromModelController.create(model, options.controllerConfig, globalDefaults)
      );
      log.info(`Generated ${controllers.length} controllers`);

      return {
        module: DecafModelModule,
        controllers,
        providers: [
          ...modelServices,
        ],
      };
    }
  }
  Object.assign(DecafModelModule, "name", {
    value: `DecafModule${flavour}`,
  });
  return DecafModelModule;
}
