import { DynamicModule, Module, Provider, Type } from "@nestjs/common";
import { Adapter, ModelService, Service } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";
import { FromModelController } from "./FromModelController";
import { DecafRequestHandlerInterceptor } from "../interceptors";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { type DecafRequestHandler } from "../types";
import { DecafHandlerExecutor, DecafRequestContext } from "../request";
import { DECAF_HANDLERS } from "../constants";

@Module({})
export class DecafModelModule {
  private static readonly log = Logging.for(DecafModelModule.name);

  private static createModelServices(models: any[]): Provider[] {
    return models.map((model) => ({
      provide: `${model.name}Service`,
      useFactory: () => ModelService.forModel(model),
    }));
  }

  static forRoot(
    flavour: string,
    handlers: Type<DecafRequestHandler>[] = []
  ): DynamicModule {
    const log = this.log.for(this.forRoot);
    log.info(`Generating controllers for flavour...`);

    const trackedModels = Adapter.models(flavour);
    const modelServices = this.createModelServices(trackedModels);
    const controllers = trackedModels.map(FromModelController.create);

    log.info(`Generated ${controllers.length} controllers`);

    return {
      module: DecafModelModule,
      controllers,
      providers: [
        {
          provide: DECAF_HANDLERS,
          useFactory: () => {
            return handlers.map((H) => {
              log.info(`Registered request handler: ${H.name}`);
              return new H();
            });
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
