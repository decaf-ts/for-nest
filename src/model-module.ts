import {
  Body,
  Controller,
  Delete,
  DynamicModule,
  Get,
  Module,
  Param,
  Post,
  Put,
} from "@nestjs/common";
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
import { Adapter, Repo, Repository } from "@decaf-ts/core";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { LoggedClass, Logger, Logging, toKebabCase } from "@decaf-ts/logging";
import { RepoFactory } from "./RepoFactory";

@Module({})
export class DecafModelModule {
  private static _logger: Logger;

  protected static get log(): Logger {
    if (!this._logger) this._logger = Logging.for(DecafModelModule);
    return this._logger;
  }

  private static toModelController<T extends Model<any>>(
    ModelClazz: ModelConstructor<any>
  ) {
    const log = this.log.for(this.toModelController);
    const tableName = Repository.table(ModelClazz);
    const routePath = toKebabCase(tableName);
    const modelClazzName = ModelClazz.name;

    log.debug(`Creating controller for model: ${modelClazzName}`);

    @Controller(routePath)
    @ApiTags(modelClazzName)
    @ApiExtraModels(ModelClazz)
    class DynamicModelController extends LoggedClass {
      // private readonly repo = this.repoFactory.for(ModelClazz);
      private readonly pk!: string;
      private readonly repo!: Repo<T>; //Repository<Model<any>, any, any, any, any>;

      constructor(private readonly repoFactory: RepoFactory) {
        super();
        log.info(
          `Registering dynamic controller for model: ${modelClazzName} route: /${routePath}`
        );

        try {
          this.repo = this.repoFactory.for(ModelClazz.name);
          this.pk = this.repo.pk as string;
        } catch (e: any) {
          this.log.error(
            `Failed to initialize repository for model "${ModelClazz.name}".`,
            e
          );
        }
      }

      @Post()
      @ApiOperation({ summary: `Create a new ${modelClazzName}.` })
      @ApiBody({
        description: `Payload for ${modelClazzName}`,
        schema: { $ref: getSchemaPath(ModelClazz) },
      })
      @ApiCreatedResponse({
        description: `${modelClazzName} created successfully.`,
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      @ApiUnprocessableEntityResponse({
        description: "Repository rejected the provided payload.",
      })
      async create(@Body() data: T): Promise<Model<any>> {
        const log = this.log.for(this.create);
        log.verbose(`creating new ${modelClazzName}`);
        let created: Model;
        try {
          created = await this.repo.create(data);
        } catch (e: unknown) {
          log.error(`Failed to create new ${modelClazzName}`, e as Error);
          throw e;
        }
        log.info(`created new ${modelClazzName} with id ${created[this.pk]}`);
        return created;
      }

      @Get(":id")
      @ApiOperation({ summary: `Retrieve a ${modelClazzName} record by id.` })
      @ApiParam({ name: "id", description: "Primary key" })
      @ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async read(@Param("id") id: string) {
        const log = this.log.for(this.read);
        let read: Model;
        try {
          log.debug(`reading ${modelClazzName} with ${this.pk} ${id}`);
          read = await this.repo.read(id);
        } catch (e: unknown) {
          log.error(
            `Failed to read ${modelClazzName} with id ${id}`,
            e as Error
          );
          throw e;
        }

        log.info(`read ${modelClazzName} with id ${read[this.pk]}`);
        return read;
      }

      @Put(":id")
      @ApiOperation({
        summary: `Replace an existing ${modelClazzName} record with a new payload.`,
      })
      @ApiBody({
        description: `Payload for replace a existing record of ${modelClazzName}`,
        schema: { $ref: getSchemaPath(ModelClazz) },
      })
      @ApiOkResponse({
        description: `${ModelClazz} record replaced successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      async update(@Body() data: Model<any>) {
        const log = this.log.for(this.update);
        let updated: Model;
        try {
          log.info(
            `updating ${modelClazzName} with ${this.pk} ${data[this.pk]}`
          );
          updated = await this.repo.create(data);
        } catch (e: unknown) {
          log.error(e as Error);
          throw e;
        }
        return updated;
      }

      @Delete(":id")
      @ApiOperation({ summary: `Delete a ${modelClazzName} record by id.` })
      @ApiParam({
        name: "id",
        description: `Primary key value of the ${modelClazzName} record to delete.`,
      })
      @ApiOkResponse({
        description: `${modelClazzName} record deleted successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async delete(@Param("id") id: string) {
        const log = this.log.for(this.delete);
        let read: Model;
        try {
          log.debug(
            `deleting ${modelClazzName} with ${this.pk as string} ${id}`
          );
          read = await this.repo.read(id);
        } catch (e: unknown) {
          log.error(
            `Failed to delete ${modelClazzName} with id ${id}`,
            e as Error
          );
          throw e;
        }
        log.info(`deleted ${modelClazzName} with id ${read[this.pk]}`);
        return read;
      }
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
