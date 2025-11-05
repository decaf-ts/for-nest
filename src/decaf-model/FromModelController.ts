import { Body, Controller, Param } from "@nestjs/common";
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
import { Repo, Repository } from "@decaf-ts/core";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { LoggedClass, Logging, toKebabCase } from "@decaf-ts/logging";
import { DBKeys, findPrimaryKey } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import {
  ApiOperationFromModel,
  ApiParamsFromModel,
  type DecafParamProps,
  DecafParams,
} from "./decorators";
import { RepoFactory } from "../RepoFactory";

export class FromModelController {
  private static readonly log = Logging.for(FromModelController.name);

  static create<T extends Model<any>>(ModelClazz: ModelConstructor<T>) {
    const log = FromModelController.log.for(FromModelController.create);
    const tableName = Repository.table(ModelClazz);
    const routePath = toKebabCase(tableName);
    const modelClazzName = ModelClazz.name;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { description, apiProperties, path } =
      FromModelController.getRouteParametersFromModel(ModelClazz);

    log.debug(`Creating controller for model: ${modelClazzName}`);

    @Controller(routePath)
    @ApiTags(modelClazzName)
    @ApiExtraModels(ModelClazz)
    class DynamicModelController extends LoggedClass {
      // private readonly repo = this.repoFactory.for(ModelClazz);
      readonly pk!: string;
      readonly repo!: Repo<T>; //Repository<Model<any>, any, any, any, any>;

      constructor(public readonly repoFactory: RepoFactory) {
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

      @ApiOperationFromModel(ModelClazz, "POST")
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
        log.info(
          `created new ${modelClazzName} with id ${(created as any)[this.pk]}`
        );
        return created;
      }

      @ApiOperationFromModel(ModelClazz, "GET", path)
      @ApiParamsFromModel(apiProperties)
      @ApiOperation({ summary: `Retrieve a ${modelClazzName} record by id.` })
      @ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async read(@Param() pathParams: any) {
        const { id } = pathParams;
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

        log.info(`read ${modelClazzName} with id ${(read as any)[this.pk]}`);
        return read;
      }

      @ApiOperationFromModel(ModelClazz, "GET", "query/:method")
      @ApiOperation({ summary: `Retrieve ${modelClazzName} records by query.` })
      @ApiParam({ name: "method", description: "Query method to be called" })
      @ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} records matches the query.`,
      })
      async query(@Param("method") method: string) {
        const log = this.log.for(this.read);
        let results: Model[] | Model;

        try {
          log.debug(`Querying ${modelClazzName} using method "${method}"`);
          results = await (this.repo as any)[method]();
        } catch (e: unknown) {
          log.error(
            `Failed to query ${modelClazzName} using method "${method}"`,
            e as Error
          );
          throw e;
        }

        log.info(
          `Successfully queried ${modelClazzName} using method "${method}"`
        );
        return results;
      }

      @ApiOperationFromModel(ModelClazz, "PUT", path)
      @ApiParamsFromModel(apiProperties)
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
      async update(
        @DecafParams(apiProperties) routeParams: DecafParamProps,
        @Body() body: Model<any>
      ) {
        const log = this.log.for(this.update);
        let updated: Model;
        try {
          log.info(
            `updating ${modelClazzName} with ${this.pk} ${(body as any)[this.pk]}`
          );
          updated = await this.repo.create(body as any);
        } catch (e: unknown) {
          log.error(e as Error);
          throw e;
        }
        return updated;
      }

      @ApiOperationFromModel(ModelClazz, "DELETE", path)
      @ApiParamsFromModel(apiProperties)
      @ApiOperation({ summary: `Delete a ${modelClazzName} record by id.` })
      @ApiOkResponse({
        description: `${modelClazzName} record deleted successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async delete(@DecafParams(apiProperties) routeParams: DecafParamProps) {
        const log = this.log.for(this.delete);
        let read: Model;
        try {
          log.debug(
            `deleting ${modelClazzName} with ${this.pk as string} ${routeParams}`
          );
          read = await this.repo.read("id");
        } catch (e: unknown) {
          log.error(
            `Failed to delete ${modelClazzName} with id ${"id"}`,
            e as Error
          );
          throw e;
        }
        log.info(`deleted ${modelClazzName} with id ${(read as any)[this.pk]}`);
        return read;
      }
    }

    return DynamicModelController as any;
  }

  static getRouteParametersFromModel<T extends Model<any>>(
    ModelClazz: ModelConstructor<T>
  ) {
    const instance = new ModelClazz({});
    const pk = (findPrimaryKey(instance)?.id || "id") as keyof Model<any>;
    const composedKeyMetaKey = Repository.key(DBKeys.COMPOSED);
    const composedKeys =
      Reflect.getMetadata(composedKeyMetaKey, instance, pk as string)?.args ??
      [];

    const keysToReturn =
      Array.isArray(composedKeys) && composedKeys.length > 0
        ? [...composedKeys]
        : [pk];

    const description = Metadata.description(ModelClazz);

    // remove duplicates while preserving order
    const uniqueKeys = Array.from(new Set(keysToReturn));

    const path = uniqueKeys.map((key) => `:${key}`).join("/");
    const apiProperties = uniqueKeys.map((key) => {
      return {
        name: key,
        description: Metadata.description(ModelClazz, key),
        required: true,
        type: String,
      };
    });
    return { description, apiProperties, path };
  }
}
