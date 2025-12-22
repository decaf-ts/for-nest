import { Controller, Param, Query } from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import {
  type DirectionLimitOffset,
  ModelService,
  Repository,
  OrderDirection,
  type Repo,
  PersistenceKeys,
  PreparedStatementKeys,
} from "@decaf-ts/core";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Logging, toKebabCase } from "@decaf-ts/logging";
import { DBKeys, ValidationError } from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import {
  type DecafApiProperty,
  DecafBody,
  type DecafModelRoute,
  type DecafParamProps,
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
      return ModelService.forModel(ModelClazz as any) as ModelService<T>;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      return Repository.forModel(ModelClazz) as Repo<T>;
    }
  }

  static createQueryRoutesFromRepository<T extends Model<boolean>>(
    persistence: Repo<T>,
    prefix: string = PersistenceKeys.QUERY
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
      persistence instanceof ModelService ? persistence.repo : persistence
    ) as Constructor<AbstractQueryController>;

    @Controller(routePath)
    @ApiTags(modelClazzName)
    @ApiExtraModels(ModelConstr)
    @Auth(ModelConstr)
    class DynamicModelController extends BaseController {
      private readonly pk: string = Model.pk(ModelConstr) as string;

      public static readonly clazz = ModelConstr;

      constructor(clientContext: DecafRequestContext) {
        super(clientContext);
        log.info(
          `Registering dynamic controller for model: ${modelClazzName} route: /${routePath}`
        );
      }

      //
      // @ApiOperationFromModel(ModelClazz, "GET", "query/:condition/:orderBy")
      // @ApiOperation({ summary: `Retrieve ${modelClazzName} records by query.` })
      // @ApiParam({ name: "method", description: "Query method to be called" })
      // @ApiOkResponse({
      //   description: `${modelClazzName} retrieved successfully.`,
      // })
      // @ApiNotFoundResponse({
      //   description: `No ${modelClazzName} records matches the query.`,
      // })
      // async query(
      //   @Param("condition") condition: Condition<any>,
      //   @Param("orderBy") orderBy: string,
      //   @QueryDetails() details: DirectionLimitOffset,
      // ) {
      //   const {direction, limit, offset} = details;
      //   return this.persistence.query(condition, orderBy as keyof Model, direction, limit, offset);
      // }

      @ApiOperationFromModel(ModelConstr, "GET", "listBy/:key")
      @ApiOperation({ summary: `Retrieve ${modelClazzName} records by query.` })
      @ApiParam({ name: "key", description: "the model key to sort by" })
      @ApiQuery({ name: "direction", required: true, enum: OrderDirection })
      @ApiOkResponse({
        description: `${modelClazzName} listed successfully.`,
      })
      async listBy(key: string, @Query() details: DirectionLimitOffset) {
        return this.persistence.listBy(
          key as keyof T,
          details.direction as OrderDirection
        );
      }

      @ApiOperationFromModel(ModelConstr, "GET", "paginateBy/:key/:page")
      @ApiOperation({ summary: `Retrieve ${modelClazzName} records by query.` })
      @ApiParam({ name: "key", description: "the model key to sort by" })
      @ApiParam({
        name: "page",
        description: "the page to retrieve or the bookmark",
      })
      @ApiQuery({
        name: "direction",
        required: true,
        enum: OrderDirection,
        description: "the sort order",
      })
      @ApiQuery({ name: "limit", required: true, description: "the page size" })
      @ApiQuery({ name: "offset", description: "the bookmark when necessary" })
      @ApiOkResponse({
        description: `${modelClazzName} listed paginated.`,
      })
      async paginateBy(
        @Param("key") key: string,
        @Query() details: DirectionLimitOffset
      ) {
        return this.persistence.paginateBy(
          key as keyof T,
          details.direction as OrderDirection,
          details as Omit<DirectionLimitOffset, "direction">
        );
      }

      @ApiOperationFromModel(ModelConstr, "GET", "findOneBy/:key")
      @ApiOperation({ summary: `Retrieve ${modelClazzName} records by query.` })
      @ApiParam({ name: "key", description: "the model key to sort by" })
      @ApiOkResponse({
        description: `${modelClazzName} listed found.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async findOneBy(@Param("key") key: string, @Param("value") value: any) {
        return this.persistence.findOneBy(key as keyof T, value);
      }

      @ApiOperationFromModel(ModelConstr, "GET", "findBy/:key/:value")
      @ApiOperation({ summary: `Retrieve ${modelClazzName} records by query.` })
      @ApiParam({ name: "key", description: "the model key to compare" })
      @ApiParam({ name: "value", description: "the value to match" })
      @ApiQuery({
        name: "direction",
        required: true,
        enum: OrderDirection,
        description: "the sort order when  applicable",
      })
      @ApiOkResponse({
        description: `${modelClazzName} listed found.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async findBy(
        @Param("key") key: string,
        @Param("value") value: any,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        @Query() details: DirectionLimitOffset
      ) {
        return this.persistence.findBy(key as keyof T, value);
      }

      @ApiOperationFromModel(ModelConstr, "GET", "statement/:method/*args")
      @ApiOperation({
        summary: `Executes a prepared statement on ${modelClazzName}.`,
      })
      @ApiParam({
        name: "method",
        description: "the prepared statement to execute",
      })
      @ApiParam({
        name: "args",
        description:
          "concatenated list of arguments the prepared statement can accept",
      })
      @ApiQuery({
        name: "direction",
        required: true,
        enum: OrderDirection,
        description: "the sort order when  applicable",
      })
      @ApiQuery({
        name: "limit",
        required: true,
        description: "limit or page size when applicable",
      })
      @ApiQuery({
        name: "offset",
        required: true,
        description: "offset or bookmark when applicable",
      })
      @ApiOkResponse({
        description: `${modelClazzName} listed found.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async statement(
        @Param("method") name: string,
        @Param("args") args: (string | number)[],
        @Query() details: DirectionLimitOffset
      ) {
        const { direction, offset, limit, bookmark } = details;
        args = args.map(
          (a) => (typeof a === "string" ? parseInt(a) : a) || a
        ) as any[];
        switch (name) {
          case PreparedStatementKeys.FIND_BY:
            break;
          case PreparedStatementKeys.LIST_BY:
            args.push(direction as string);
            break;
          case PreparedStatementKeys.PAGE_BY:
            args = [
              args[0],
              direction as any,
              { limit: limit, offset: offset, bookmark: bookmark },
            ];
            break;
          case PreparedStatementKeys.FIND_ONE_BY:
            break;
        }
        return this.persistence.statement(name, ...args);
      }

      @ApiOperationFromModel(ModelConstr, "POST", "bulk")
      @ApiOperation({ summary: `Create a new ${modelClazzName}.` })
      @ApiBody({
        description: `Payload for ${modelClazzName}`,
        schema: {
          type: "array",
          items: { $ref: getSchemaPath(ModelConstr) },
        },
      })
      @ApiCreatedResponse({
        description: `x ${modelClazzName} created successfully.`,
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      @ApiUnprocessableEntityResponse({
        description: "Repository rejected the provided payload.",
      })
      async createAll(@DecafBody() data: T[]): Promise<Model[]> {
        const log = this.log.for(this.createAll);
        log.verbose(`creating new ${modelClazzName}`);
        let created: T[];
        try {
          created = await this.persistence.createAll(
            data.map((d) => new ModelConstr(d))
          );
        } catch (e: unknown) {
          log.error(`Failed to create new ${modelClazzName}`, e as Error);
          throw e;
        }
        log.info(
          `created new ${modelClazzName} with id ${(created as any)[this.pk]}`
        );
        return created;
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
      async create(@DecafBody() data: T): Promise<Model<any>> {
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

      @ApiOperationFromModel(ModelConstr, "GET", "bulk")
      @ApiOperation({ summary: `Retrieve a ${modelClazzName} record by id.` })
      @ApiQuery({ name: "ids", required: true, type: "array" })
      @ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async readAll(@Query("ids") ids: string[]) {
        const log = this.log.for(this.readAll);
        let read: Model[];
        try {
          log.debug(`reading ${ids.length} ${modelClazzName}: ${ids}`);
          read = await this.persistence.readAll(ids as any);
        } catch (e: unknown) {
          log.error(`Failed to ${modelClazzName} with id ${ids}`, e as Error);
          throw e;
        }

        log.info(`read ${read.length} ${modelClazzName}`);
        return read;
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
        const id = getPK(...routeParams.valuesInOrder);
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

      @ApiOperationFromModel(ModelConstr, "PUT", `bulk`)
      @ApiParamsFromModel(apiProperties)
      @ApiOperation({
        summary: `Replace an existing ${modelClazzName} record with a new payload.`,
      })
      @ApiBody({
        description: `Payload for replace a existing record of ${modelClazzName}`,
        schema: {
          type: "array",
          items: { $ref: getSchemaPath(ModelConstr) },
        },
      })
      @ApiOkResponse({
        description: `${ModelConstr} record replaced successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      async updateAll(@DecafBody() body: T[]) {
        const log = this.log.for(this.updateAll);

        let updated: T[];
        try {
          log.info(`updating ${body.length} ${modelClazzName}`);
          updated = await this.persistence.updateAll(body);
        } catch (e: unknown) {
          log.error(e as Error);
          throw e;
        }
        return updated;
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
        @DecafBody() body: T
      ) {
        const log = this.log.for(this.update);
        const id = getPK(...routeParams.valuesInOrder);
        if (typeof id === "undefined")
          throw new ValidationError(`No ${this.pk} provided`);

        let updated: T;
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

      @ApiOperationFromModel(ModelConstr, "DELETE", "bulk")
      @ApiParamsFromModel(apiProperties)
      @ApiOperation({ summary: `Retrieve a ${modelClazzName} record by id.` })
      @ApiQuery({ name: "ids", required: true, type: "array" })
      @ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async deleteAll(@Query("ids") ids: string[]) {
        const log = this.log.for(this.deleteAll);
        let read: Model[];
        try {
          log.debug(`deleting ${ids.length} ${modelClazzName}: ${ids}`);
          read = await this.persistence.deleteAll(ids);
        } catch (e: unknown) {
          log.error(
            `Failed to delete ${modelClazzName} with id ${ids}`,
            e as Error
          );
          throw e;
        }

        log.info(`deleted ${read.length} ${modelClazzName}`);
        return read;
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
        const id = getPK(...routeParams.valuesInOrder);
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
    const apiProperties: DecafApiProperty[] = uniqueKeys.map((key) => {
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
