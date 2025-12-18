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
import {
  ModelService,
  PersistenceKeys,
  Repo,
  Repository,
} from "@decaf-ts/core";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Logging, toKebabCase } from "@decaf-ts/logging";
import { DBKeys, ValidationError } from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import type {
  DecafApiProperties,
  DecafModelRoute,
  DecafParamProps,
} from "./decorators";
import {
  ApiOperationFromModel,
  ApiParamsFromModel,
  DecafParams,
} from "./decorators";
import { DecafRequestContext } from "../request";
import { DECAF_ADAPTER_OPTIONS } from "../constants";
import {
  applyApiDecorators,
  getApiDecorators,
  createRouteHandler,
  defineRouteMethod,
} from "./utils";
import { Auth } from "./decorators/decorators";
import { AbstractQueryController, ControllerConstructor } from "./types";

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

  static getPersistence<T extends Model<boolean>>(
    ModelClazz: ModelConstructor<T>
  ): Repo<T> | ModelService<T> {
    try {
      throw new Error("");
      return ModelService.forModel(ModelClazz);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      return Repository.forModel(ModelClazz);
    }
  }

  static createQueryRoutesFromRepository<T extends Model<boolean>>(
    persistence: Repo<T> | ModelService<T>,
    prefix: string = "statement"
  ): ControllerConstructor<AbstractQueryController> {
    const ModelConstr: Constructor = persistence.class;
    const methodQueries: Record<string, { fields?: string[] | undefined }> =
      Metadata.get(
        persistence.constructor as Constructor,
        Metadata.key(PersistenceKeys.QUERY)
      ) ?? {};

    // create base class
    class QueryController extends AbstractQueryController {
      constructor(clientContext: DecafRequestContext) {
        super(clientContext);
        this._persistence = FromModelController.getPersistence(ModelConstr);
      }

      override get persistence() {
        const adapterOptions = this.clientContext.get(DECAF_ADAPTER_OPTIONS);
        if (adapterOptions) return this._persistence.for(adapterOptions) as any;
        return this._persistence;
      }
    }

    for (const [methodName, objValues] of Object.entries(methodQueries)) {
      const fields = objValues.fields ?? [];
      const routePath = [prefix, methodName, ...fields.map((f) => `:${f}`)]
        .filter((segment) => segment && segment.trim())
        .join("/");

      const handler = createRouteHandler(methodName) as any;
      const descriptor = defineRouteMethod(
        QueryController,
        methodName,
        handler
      );

      if (descriptor) {
        const decorators = getApiDecorators(methodName, routePath);

        applyApiDecorators(QueryController, methodName, descriptor, decorators);
      }
    }

    return QueryController;
  }

  static create<T extends Model<any>>(ModelConstr: ModelConstructor<T>) {
    const log = FromModelController.log.for(FromModelController.create);
    const tableName = Model.tableName(ModelConstr);
    const routePath = toKebabCase(tableName);
    const modelClazzName = ModelConstr.name;
    const persistence = FromModelController.getPersistence(ModelConstr);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { description, getPK, apiProperties, path } =
      FromModelController.getRouteParametersFromModel(ModelConstr);

    log.debug(`Creating controller for model: ${modelClazzName}`);

    const BaseController = FromModelController.createQueryRoutesFromRepository(
      persistence
    ) as Constructor<AbstractQueryController>;

    @Controller(routePath)
    @ApiTags(modelClazzName)
    @ApiExtraModels(ModelConstr)
    @Auth(ModelConstr)
    class DynamicModelController extends BaseController {
      private readonly pk: string = Model.pk(ModelConstr) as string;

      constructor(clientContext: DecafRequestContext) {
        super(clientContext);
        log.info(
          `Registering dynamic controller for model: ${modelClazzName} route: /${routePath}`
        );
      }

      @ApiOperationFromModel(ModelConstr, "POST")
      @ApiOperation({ summary: `Create a new ${modelClazzName}.` })
      @ApiBody({
        description: `Payload for ${modelClazzName}`,
        schema: { $ref: getSchemaPath(ModelConstr) },
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
          created = await this.persistence.create(data);
        } catch (e: unknown) {
          log.error(`Failed to create new ${modelClazzName}`, e as Error);
          throw e;
        }
        log.info(
          `created new ${modelClazzName} with id ${(created as any)[this.pk]}`
        );
        return created;
      }

      @ApiOperationFromModel(ModelConstr, "GET", path)
      @ApiParamsFromModel(apiProperties)
      @ApiOperation({ summary: `Retrieve a ${modelClazzName} record by id.` })
      @ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async read(@DecafParams(apiProperties) routeParams: DecafParamProps) {
        const id = getPK(...routeParams.ordered);
        if (typeof id === "undefined")
          throw new ValidationError(`No ${this.pk} provided`);

        const log = this.log.for(this.read);
        let read: Model;
        try {
          log.debug(`reading ${modelClazzName} with ${this.pk} ${id}`);
          read = await this.persistence.read(id);
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

      @ApiOperationFromModel(ModelConstr, "GET", "query/:method")
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
          const args = [method];
          results = await (this.persistence.query as any)(...args);
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

      @ApiOperationFromModel(ModelConstr, "PUT", path)
      @ApiParamsFromModel(apiProperties)
      @ApiOperation({
        summary: `Replace an existing ${modelClazzName} record with a new payload.`,
      })
      @ApiBody({
        description: `Payload for replace a existing record of ${modelClazzName}`,
        schema: { $ref: getSchemaPath(ModelConstr) },
      })
      @ApiOkResponse({
        description: `${ModelConstr} record replaced successfully.`,
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
        const id = getPK(...routeParams.ordered);
        if (typeof id === "undefined")
          throw new ValidationError(`No ${this.pk} provided`);

        let updated: Model;
        try {
          log.info(`updating ${modelClazzName} with ${this.pk} ${id}`);
          updated = await this.persistence.update(
            new ModelConstr({
              ...body,
              [this.pk]: id,
            })
          );
        } catch (e: unknown) {
          log.error(e as Error);
          throw e;
        }
        return updated;
      }

      @ApiOperationFromModel(ModelConstr, "DELETE", path)
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
        const id = getPK(...routeParams.ordered);
        if (typeof id === "undefined")
          throw new ValidationError(`No ${this.pk} provided`);

        let del: Model;
        try {
          log.debug(
            `deleting ${modelClazzName} with ${this.pk as string} ${id}`
          );
          del = await this.persistence.delete(id);
        } catch (e: unknown) {
          log.error(
            `Failed to delete ${modelClazzName} with id ${id}`,
            e as Error
          );
          throw e;
        }
        log.info(`deleted ${modelClazzName} with id ${id}`);
        return del;
      }
    }

    return DynamicModelController as any;
  }

  static getRouteParametersFromModel<T extends Model<any>>(
    ModelClazz: ModelConstructor<T>
  ): DecafModelRoute {
    const pk = Model.pk(ModelClazz) as keyof Model<any>;
    const composed = Metadata.get(
      ModelClazz,
      Metadata.key(DBKeys.COMPOSED, pk)
    );
    const composedKeys = composed?.args ?? [];

    // remove duplicates while preserving order
    const uniqueKeys =
      Array.isArray(composedKeys) && composedKeys.length > 0
        ? Array.from(new Set([...composedKeys]))
        : Array.from(new Set([pk]));

    const description = Metadata.description(ModelClazz);
    const path = `:${uniqueKeys.join("/:")}`;
    const apiProperties: DecafApiProperties[] = uniqueKeys.map((key) => {
      return {
        name: key,
        description: Metadata.description(ModelClazz, key),
        required: true,
        type: String,
      };
    });

    return {
      path,
      description,
      apiProperties,
      getPK: (...params: Array<string | number>) =>
        composed?.separator ? params.join(composed.separator) : params.join(""),
    };
  }
}
