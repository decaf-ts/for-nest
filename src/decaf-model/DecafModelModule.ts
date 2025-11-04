import { DynamicModule, Module } from "@nestjs/common";
import { Adapter } from "@decaf-ts/core";
import { Logging } from "@decaf-ts/logging";
import { RepoFactory } from "../RepoFactory";
import { FromModelController } from "./FromModelController";

@Module({})
export class DecafModelModule {
  private static readonly log = Logging.for(DecafModelModule.name);

  static forRoot(flavour: string): DynamicModule {
    const log = this.log.for(this.forRoot);
    log.info(`Generating controllers for flavour...`);

    const trackedModels = Adapter.models(flavour);
    const controllers = trackedModels.map(FromModelController.create);

    log.info(`Generated ${controllers.length} controllers`);

    return {
      module: DecafModelModule,
      controllers,
      providers: [RepoFactory],
    };
  }
}
