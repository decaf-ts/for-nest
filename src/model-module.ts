import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { Adapter, Repository } from "@decaf-ts/core";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { LoggedClass, Logger, Logging, toKebabCase } from "@decaf-ts/logging";
import { repoForModel } from "./utils";
import { RepoFactory } from "./RepoFactory";
import { DynamicModule, Module } from "@nestjs/common";

@Module({})
export class DecafModelModule {
  private static _logger: Logger;

  protected static get log(): Logger {
    if (!this._logger) this._logger = Logging.for(DecafModelModule);
    return this._logger;
  }

  private static toModelController<T extends Model<any>>(
    modelClass: ModelConstructor<any>
  ) {
    const log = this.log.for(this.toModelController);
    log.debug(`Creating model controller... ${modelClass.name}`);
    const modelName = toKebabCase(Repository.table(modelClass));
    const route = modelName;

    @Controller(route)
    @ApiTags(modelName)
    @ApiExtraModels(modelClass)
    class DynamicModelController extends LoggedClass {
      private readonly repo: any; //= this.repoFactory.for(modelClass.name);

      constructor(private readonly repoFactory: RepoFactory) {
        super();
        try {
          this.repo = this.repoFactory.for(modelClass.name);
        } catch (e: unknown) {
          log.error(
            `Failed to get repository for ${modelClass.name}`,
            e as Error
          );
        }
      }

      @Post()
      @ApiOperation({ summary: `Create a new ${modelName}.` })
      @ApiBody({
        description: `Payload for ${modelName}`,
        schema: { $ref: getSchemaPath(modelClass) },
      })
      @ApiCreatedResponse({ description: `${modelName} created successfully.` })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      @ApiUnprocessableEntityResponse({
        description: "Repository rejected the provided payload.",
      })
      async create(@Body() data: T): Promise<Model<any>> {
        const log = this.log.for(this.create);
        log.verbose(`creating new ${modelName}`);
        const r = repoForModel("Account");
        const created = await r.create(data);
        log.info(`created new ${modelName} with id ${created[r.pk]}`);
        return created;
      }

      @Get(":id")
      @ApiOperation({ summary: `Retrieve a ${modelName} by id.` })
      @ApiParam({
        name: "id",
        description: "Primary key",
        example: "1234-5678",
      })
      @ApiOkResponse({ description: `${modelName} retrieved successfully.` })
      @ApiNotFoundResponse({
        description: "No record matches the provided identifier.",
      })
      async read(@Param("id") id: string) {
        const log = this.log.for(this.read);
        log.debug(`reading ${modelName} with ${this.repo.pk as string} ${id}`);
        const read = await this.repo.read(id);
        log.info(`read ${modelName} with id ${read[this.repo.pk]}`);
        return read;
      }

      // @Post()
      // @ApiOperation({summary: "Create a new record for the given model."})
      // @ApiCreatedResponse({description: "Record created successfully."})
      // @ApiBadRequestResponse({description: "Payload validation failed."})
      // @ApiUnprocessableEntityResponse({description: "Repository rejected the provided payload."})
      // async create(@Param("model") model: string, @Body() data: any) {
      //     const log = this.log.for(this.create);
      //     log.verbose(`creating new ${model}`);
      //     let repo: Repo<Model>;
      //     let created: Model;
      //     try {
      //         repo = repoForModel(model);
      //         created = await repo.create(data);
      //     } catch (e: unknown) {
      //         log.error(`Failed to create new ${model}`, e as Error);
      //         throw e;
      //     }
      //     log.info(`created new ${model} with id ${created[repo.pk]}`);
      //     return created;
      // }

      // @Get(":id")
      // @ApiOperation({summary: "Retrieve a single record by id."})
      // @ApiParam({
      //     name: "model",
      //     // description: 'Name of the model repository to target.' + `\n${modelList.map((m: string, i: number) => `${m} - ${Metadata.description(trackedModels[i])}`).join('\n')}`,
      //     example: "agent",
      // })
      // @ApiParam({
      //     name: "id",
      //     description: "Primary key value used to load the record.",
      //     example: "1234-5678",
      // })
      // @ApiOkResponse({description: "Record retrieved successfully."})
      // @ApiNotFoundResponse({description: "No record matches the provided identifier."})
      // async read(@Param("model") model: string, @Param("id") id: string) {
      //     const log = this.log.for(this.read);
      //     let repo: Repo<Model>;
      //     let read: Model;
      //     try {
      //         repo = repoForModel(model);
      //         log.debug(`reading ${model} with ${repo.pk as string} ${id}`);
      //         read = await repo.read(id);
      //     } catch (e: unknown) {
      //         log.error(`Failed to read ${model} with id ${id}`, e as Error);
      //         throw e;
      //     }
      //     log.info(`read ${model} with id ${read[repo.pk]}`);
      //     return read;
      // }
    }

    return DynamicModelController;
  }

  static forRoot(flavour: string): DynamicModule {
    const log = this.log.for(this.forRoot);
    log.info(`Generating controllers for flavour...`);

    const trackedModels = Adapter.models(flavour);
    const controllers = trackedModels.map(this.toModelController.bind(this));

    log.info(`Generated ${controllers.length} controllers`);

    return {
      module: DecafModelModule,
      controllers,
      providers: [RepoFactory],
    };
  }
}
