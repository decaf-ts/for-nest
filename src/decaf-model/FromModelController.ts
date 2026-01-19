import { Controller, Param, Query, Response } from "@nestjs/common";
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
  OrderDirection,
  PersistenceKeys,
  PreparedStatementKeys,
  type Repo,
  Repository,
} from "@decaf-ts/core";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Logging, toKebabCase } from "@decaf-ts/logging";
import {
  BulkCrudOperationKeys,
  DBKeys,
  OperationKeys,
  ValidationError,
} from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import {
  ApiOperationFromModel,
  ApiParamsFromModel,
  type DecafApiProperty,
  DecafBody,
  type DecafModelRoute,
  type DecafParamProps,
  DecafParams,
  DecafQuery,
  DecafRouteDecOptions,
} from "./decorators";
import { DecafRequestContext } from "../request";
import { DECAF_ROUTE } from "../constants";
import {
  applyApiDecorators,
  createRouteHandler,
  defineRouteMethod,
  getApiDecorators,
} from "./utils";
import { Auth } from "./decorators/decorators";
import { ControllerConstructor } from "./types";
import { DecafModelController } from "../controllers";
import { DtoFor } from "../factory/openapi/DtoBuilder";
import "../overrides";

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
      return ModelService.getService(ModelClazz) as ModelService<T>;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      return Repository.forModel(ModelClazz) as Repo<T>;
    }
  }

  static createQueryRoutesFromRepository<T extends Model<boolean>>(
    persistence: Repo<T> | ModelService<T>,
    prefix: string = PersistenceKeys.QUERY
  ): ControllerConstructor<T> {
    const log = FromModelController.log.for(
      FromModelController.createQueryRoutesFromRepository
    );
    const repo: Repo<T> =
      persistence instanceof ModelService ? persistence.repo : persistence;
    const ModelConstr: Constructor = repo.class;
    const queryMethods: Record<string, { fields?: string[] | undefined }> =
      Metadata.get(
        repo.constructor as Constructor,
        Metadata.key(PersistenceKeys.QUERY)
      ) ?? {};

    const routeMethods: Record<string, DecafRouteDecOptions> =
      Metadata.get(
        persistence.constructor as Constructor,
        Metadata.key(DECAF_ROUTE)
      ) ?? {};

    // create base class
    class QueryController extends DecafModelController<T> {
      override get class(): ModelConstructor<T> {
        throw new Error("Method not implemented.");
      }
      constructor(clientContext: DecafRequestContext, name: string) {
        super(clientContext, name);
      }
    }

    for (const [methodName, params] of Object.entries(routeMethods)) {
      // regex to trim slashes from start and end
      const routePath = [params.path.replace(/^\/+|\/+$/g, "")]
        .filter((segment) => segment && segment.trim())
        .join("/");

      // const handler = params.handler.value;
      const handler = createRouteHandler(methodName) as any;
      if (!handler) {
        const message = `Invalid or missing handler for model ${ModelConstr.name} on decorated method ${methodName}`;
        log.error(message);
        throw new Error(message);
      }

      const descriptor = defineRouteMethod(
        QueryController,
        methodName,
        handler
      );

      if (descriptor) {
        const decorators = getApiDecorators(
          methodName,
          routePath,
          params.httpMethod
        );
        applyApiDecorators(QueryController, methodName, descriptor, decorators);
      }
    }

    for (const [methodName, objValues] of Object.entries(queryMethods)) {
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
        const decorators = getApiDecorators(methodName, routePath, "GET", true);
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
      persistence // instanceof ModelService ? persistence.repo : persistence
    ) as Constructor<DecafModelController<T>>;

    @Controller(routePath)
    @ApiTags(modelClazzName)
    @ApiExtraModels(ModelConstr)
    @Auth(ModelConstr)
    class DynamicModelController extends BaseController {
      private readonly pk: string = Model.pk(ModelConstr) as string;

      protected static get class() {
        return ModelConstr;
      }

      override get class(): ModelConstructor<T> {
        return ModelConstr;
        // return DynamicModelController.class;
      }

      constructor(clientContext: DecafRequestContext) {
        super(clientContext);
        log.info(
          `Registering dynamic controller for model: ${this.class.name} route: /${routePath}`
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
      async listBy(key: string, @DecafQuery() details: DirectionLimitOffset) {
        const { ctx } = (
          await this.logCtx([], PreparedStatementKeys.LIST_BY, true)
        ).for(this.listBy);
        return this.persistence(ctx).listBy(
          key as keyof T,
          details.direction as OrderDirection,
          ctx
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
        @DecafQuery() details: DirectionLimitOffset
      ) {
        const { ctx } = (
          await this.logCtx([], PreparedStatementKeys.PAGE_BY, true)
        ).for(this.paginateBy);
        return this.persistence(ctx).paginateBy(
          key as keyof T,
          details.direction as OrderDirection,
          details as Omit<DirectionLimitOffset, "direction">,
          ctx
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
        const { ctx } = (
          await this.logCtx([], PreparedStatementKeys.FIND_ONE_BY, true)
        ).for(this.findOneBy);
        return this.persistence(ctx).findOneBy(key as keyof T, value, ctx);
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
        @DecafQuery() details: DirectionLimitOffset
      ) {
        const { ctx } = (
          await this.logCtx([], PreparedStatementKeys.FIND_BY, true)
        ).for(this.findBy);
        return this.persistence(ctx)
          .for(ctx.toOverrides())
          .findBy(key as keyof T, value, ctx);
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
        @DecafQuery() details: DirectionLimitOffset
      ) {
        const { ctx } = (
          await this.logCtx([], PersistenceKeys.STATEMENT, true)
        ).for(this.statement);
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
              {
                limit: limit,
                offset: offset,
                bookmark: bookmark,
              },
            ];
            break;
          case PreparedStatementKeys.FIND_ONE_BY:
            break;
        }
        return this.persistence(ctx).statement(name, ...args, ctx);
      }

      @ApiOperationFromModel(ModelConstr, "POST", "bulk")
      @ApiOperation({ summary: `Create a new ${modelClazzName}.` })
      @ApiBody({
        description: `Payload for ${modelClazzName}`,
        schema: {
          type: "array",
          items: {
            $ref: getSchemaPath(ModelConstr),
            // $ref: getSchemaPath(DtoFor(OperationKeys.CREATE, ModelConstr)),
          },
        },
      })
      @ApiCreatedResponse({
        description: `${modelClazzName} created successfully.`,
        schema: {
          type: "array",
          items: {
            $ref: getSchemaPath(ModelConstr),
          },
        },
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      @ApiUnprocessableEntityResponse({
        description: "Repository rejected the provided payload.",
      })
      async createAll(
        @DecafBody() data: T[],
        @Response({ passthrough: true }) resp: any
      ): Promise<Model[]> {
        const { ctx, log } = (
          await this.logCtx([], BulkCrudOperationKeys.CREATE_ALL, true)
        ).for(this.createAll);
        log.verbose(`creating new ${modelClazzName}`);
        let created: T[];
        try {
          created = await this.persistence(ctx).createAll(
            data.map((d) => new ModelConstr(d)),
            ctx
          );
        } catch (e: unknown) {
          log.error(`Failed to create new ${modelClazzName}`, e as Error);
          throw e;
        }
        log.info(
          `created new ${modelClazzName} with id ${(created as any)[this.pk]}`
        );

        ctx.toResponse(resp);
        return created;
      }

      @ApiOperationFromModel(ModelConstr, "POST")
      @ApiOperation({ summary: `Create a new ${modelClazzName}.` })
      @ApiBody({
        description: `Payload for ${modelClazzName}`,
        type: DtoFor(OperationKeys.CREATE, ModelConstr),
      })
      @ApiCreatedResponse({
        description: `${modelClazzName} created successfully.`,
        schema: {
          $ref: getSchemaPath(ModelConstr),
        },
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      @ApiUnprocessableEntityResponse({
        description: "Repository rejected the provided payload.",
      })
      async create(
        @DecafBody() data: T,
        @Response({ passthrough: true }) resp: any
      ): Promise<Model<any>> {
        const { ctx, log } = (
          await this.logCtx([], OperationKeys.CREATE, true)
        ).for(this.create);
        log.verbose(`creating new ${modelClazzName}`);
        let created: Model;
        try {
          const persistence = this.persistence(ctx);
          created = await persistence.create(data, ctx);
        } catch (e: unknown) {
          log.error(`Failed to create new ${modelClazzName}`, e as Error);
          throw e;
        }
        log.info(
          `created new ${modelClazzName} with id ${(created as any)[this.pk]}`
        );
        ctx.toResponse(resp);
        return created;
      }

      @ApiOperationFromModel(ModelConstr, "GET", "bulk")
      @ApiOperation({ summary: `Retrieve a ${modelClazzName} record by id.` })
      @ApiQuery({ name: "ids", required: true, type: "array" })
      @ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
        schema: {
          type: "array",
          items: {
            $ref: getSchemaPath(ModelConstr),
          },
        },
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async readAll(@Query("ids") ids: string[]) {
        const { ctx, log } = (
          await this.logCtx([], BulkCrudOperationKeys.READ_ALL, true)
        ).for(this.readAll);
        let read: Model[];
        try {
          log.debug(`reading ${ids.length} ${modelClazzName}: ${ids}`);
          const persistence = this.persistence(ctx);
          read = await persistence.readAll(ids as any, ctx);
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
        schema: {
          $ref: getSchemaPath(ModelConstr),
        },
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      async read(@DecafParams(apiProperties) routeParams: DecafParamProps) {
        const { ctx, log } = (
          await this.logCtx([], OperationKeys.READ, true)
        ).for(this.read);
        const id = getPK(...routeParams.valuesInOrder);
        if (typeof id === "undefined")
          throw new ValidationError(`No ${this.pk} provided`);

        let read: Model;
        try {
          log.debug(`reading ${modelClazzName} with ${this.pk} ${id}`);
          const persistence = this.persistence(ctx);
          read = await persistence.read(id, ctx);
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
          items: {
            $ref: getSchemaPath(ModelConstr),
            // $ref: getSchemaPath(DtoFor(OperationKeys.UPDATE, ModelConstr)),
          },
        },
      })
      @ApiCreatedResponse({
        description: `${modelClazzName} updated successfully.`,
        schema: {
          type: "array",
          items: {
            $ref: getSchemaPath(ModelConstr),
          },
        },
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      async updateAll(
        @DecafBody() body: T[],
        @Response({ passthrough: true }) resp: any
      ) {
        const { ctx, log } = (
          await this.logCtx([], BulkCrudOperationKeys.UPDATE_ALL, true)
        ).for(this.updateAll);

        let updated: T[];
        try {
          log.info(`updating ${body.length} ${modelClazzName}`);
          const payloads = body.map((entry) =>
            JSON.parse(JSON.stringify(entry))
          );
          updated = await this.persistence(ctx).updateAll(payloads, ctx);
        } catch (e: unknown) {
          log.error(e as Error);
          throw e;
        }
        ctx.toResponse(resp);
        return updated;
      }

      @ApiOperationFromModel(ModelConstr, "PUT", path)
      @ApiParamsFromModel(apiProperties)
      @ApiOperation({
        summary: `Replace an existing ${modelClazzName} record with a new payload.`,
      })
      @ApiBody({
        description: `Payload for replace a existing record of ${modelClazzName}`,
        schema: {
          $ref: getSchemaPath(ModelConstr),
          // $ref: getSchemaPath(DtoFor(OperationKeys.UPDATE, ModelConstr)),
        },
      })
      @ApiOkResponse({
        description: `${modelClazzName} updated successfully.`,
      })
      @ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      })
      @ApiBadRequestResponse({ description: "Payload validation failed." })
      async update(
        @DecafParams(apiProperties) routeParams: DecafParamProps,
        @DecafBody() body: T,
        @Response({ passthrough: true }) resp: any
      ) {
        const { ctx, log } = (
          await this.logCtx([], OperationKeys.UPDATE, true)
        ).for(this.update);

        const id = getPK(...routeParams.valuesInOrder);
        if (typeof id === "undefined")
          throw new ValidationError(`No ${this.pk} provided`);

        let updated: T;
        try {
          log.info(`updating ${modelClazzName} with ${this.pk} ${id}`);
          const payload = JSON.parse(JSON.stringify(body));
          const persistence = this.persistence(ctx);
          updated = await persistence.update(
            new ModelConstr({
              ...payload,
              [this.pk]: id,
            }),
            ctx
          );
        } catch (e: unknown) {
          log.error(e as Error);
          throw e;
        }
        ctx.toResponse(resp);
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
      async deleteAll(
        @Query("ids") ids: string[],
        @Response({ passthrough: true }) resp: any
      ) {
        const { ctx, log } = (
          await this.logCtx([], BulkCrudOperationKeys.DELETE_ALL, true)
        ).for(this.deleteAll);
        let read: Model[];
        try {
          log.debug(`deleting ${ids.length} ${modelClazzName}: ${ids}`);
          read = await this.persistence(ctx).deleteAll(ids, ctx);
        } catch (e: unknown) {
          log.error(
            `Failed to delete ${modelClazzName} with id ${ids}`,
            e as Error
          );
          throw e;
        }

        log.info(`deleted ${read.length} ${modelClazzName}`);
        ctx.toResponse(resp);
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
      async delete(
        @DecafParams(apiProperties) routeParams: DecafParamProps,
        @Response({ passthrough: true }) resp: any
      ) {
        const { ctx, log } = (
          await this.logCtx([], OperationKeys.DELETE, true)
        ).for(this.delete);

        const id = getPK(...routeParams.valuesInOrder);
        if (typeof id === "undefined")
          throw new ValidationError(`No ${this.pk} provided`);

        let del: Model;
        try {
          log.debug(
            `deleting ${modelClazzName} with ${this.pk as string} ${id}`
          );
          del = await this.persistence(ctx).delete(id, ctx);
        } catch (e: unknown) {
          log.error(
            `Failed to delete ${modelClazzName} with id ${id}`,
            e as Error
          );
          throw e;
        }
        log.info(`deleted ${modelClazzName} with id ${id}`);
        ctx.toResponse(resp);
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
