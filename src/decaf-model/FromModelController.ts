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
import { DBKeys } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";
import {
  ApiOperationFromModel,
  ApiParamsFromModel,
  type DecafParamProps,
  DecafParams,
} from "./decorators";
import { DecafRequestContext } from "../request";
import { DECAF_ADAPTER_OPTIONS } from "../constants";

/**
 * @description
 * Factory and utilities for generating dynamic NestJS controllers from Decaf {@link Model} definitions.
 *
 * @summary
 * The `FromModelController` class provides the infrastructure necessary to automatically generate
 * strongly-typed CRUD controllers based on a given {@link ModelConstructor}. It inspects metadata from
 * the model, derives route paths, parameters, and generates a dynamic controller class at runtime with
 * full support for querying, creation, update, and deletion of model entities through a {@link Repo}.
 *
 * @template T The {@link Model} type associated with the generated controller.
 *
 * @param ModelClazz The model class to generate the controller from.
 *
 * @class FromModelController
 *
 * @example
 * ```ts
 * // Given a Decaf Model:
 * class User extends Model<User> {
 *   id!: string;
 *   name!: string;
 * }
 *
 * // Register controller:
 * const UserController = FromModelController.create(User);
 *
 * // NestJS will expose:
 * // POST   /user
 * // GET    /user/:id
 * // GET    /user/query/:method
 * // PUT    /user/:id
 * // DELETE /user/:id
 * ```
 *
 * @mermaid
 * sequenceDiagram
 *     participant Client
 *     participant Controller
 *     participant Repo
 *     participant DB
 *
 *     Client->>Controller: HTTP Request
 *     Controller->>Repo: Resolve repository for Model
 *     Repo->>DB: Execute DB operation
 *     DB-->>Repo: DB Result
 *     Repo-->>Controller: Model Instance(s)
 *     Controller-->>Client: JSON Response
 */
export class FromModelController {
  private static readonly log = Logging.for(FromModelController.name);

  static create<T extends Model<any>>(ModelClazz: ModelConstructor<T>) {
    const log = FromModelController.log.for(FromModelController.create);
    const tableName = Model.tableName(ModelClazz);
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
      private _repo!: Repo<T>;
      private readonly pk: string = Model.pk(ModelClazz) as string;

      constructor(private clientContext: DecafRequestContext) {
        super();
        log.info(
          `Registering dynamic controller for model: ${modelClazzName} route: /${routePath}`
        );
      }

      get repository() {
        if (!this._repo) this._repo = Repository.forModel(ModelClazz);

        const adapterOptions = this.clientContext.get(DECAF_ADAPTER_OPTIONS);
        if (adapterOptions) return this._repo.for(adapterOptions);

        return this._repo;
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
          created = await this.repository.create(data);
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
          read = await this.repository.read(id);
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
          results = await (this.repository as any)[method]();
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
          updated = await this.repository.create(body as any);
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
          read = await this.repository.read("id");
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
    const pk = Model.pk(ModelClazz) as keyof Model<any>;
    const composedKeyMetaKey = DBKeys.COMPOSED;
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
