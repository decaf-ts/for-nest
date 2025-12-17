import { DynamicModule, Module, Provider } from "@nestjs/common";
import { Adapter, ModelService } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";
import { FromModelController } from "./FromModelController";
import { DecafRequestHandlerInterceptor } from "../interceptors";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DecafModuleOptions } from "../types";
import { DecafHandlerExecutor, DecafRequestContext } from "../request";
import { DECAF_HANDLERS } from "../constants";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";

@Module({})
export class DecafModelModule {
  private static readonly log = Logging.for(DecafModelModule.name);

  private static createModelServices<T extends Model<boolean>>(
    models: ModelConstructor<T>[]
  ): Provider[] {
    return models.map((model) => ({
      provide: `${model.name}Service`,
      useFactory: () => ModelService.forModel(model),
    }));
  }

  static forRoot(
    flavour: string,
    options: Partial<DecafModuleOptions> = {}
  ): DynamicModule {
    const log = this.log.for(this.forRoot);
    log.info(`Generating controllers for flavour...`);

    const trackedModels = Adapter.models(flavour);

    let modelServices = [];
    if (options.autoServices) {
      log.info("Auto-services enabled. Initializing service generation.");
      modelServices = this.createModelServices(trackedModels);
      log.info(
        `Auto-services completed. ${modelServices.length} services initialized.`
      );
    }

    const controllers = trackedModels.map(FromModelController.create);
    log.info(`Generated ${controllers.length} controllers`);

    return {
      module: DecafModelModule,
      controllers,
      providers: [
        {
          provide: DECAF_HANDLERS,
          useFactory: () => {
            return (
              options.handlers?.map((H) => {
                log.info(`Registered request handler: ${H.name}`);
                return new H();
              }) ?? []
            );
          },
        },
        DecafRequestContext,
        DecafHandlerExecutor,
        {
          provide: APP_INTERCEPTOR,
          useClass: DecafRequestHandlerInterceptor,
        },
        ...modelServices,
      ],
    };
  }
}
