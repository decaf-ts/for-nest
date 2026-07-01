import {
  Controller,
  Param,
  Query,
  Response,
  SetMetadata,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
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
  ModelService,
  OrderDirection,
  PersistenceKeys,
  PreparedStatementKeys,
  type Repo,
  Repository,
  Service,
} from "@decaf-ts/core";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { Logging, toKebabCase } from "@decaf-ts/logging";
import {
  DBKeys,
  BaseError,
  InternalError,
  OperationKeys,
} from "@decaf-ts/db-decorators";
import { Constructor, Metadata } from "@decaf-ts/decoration";
import {
  ApiOperationFromModel,
  ApiParamsFromModel,
  type DecafApiProperty,
  DecafBody,
  DecafQuery,
} from "./decorators";
import { HttpVerbToDecorator } from "./decorators/utils";
import type { HttpVerbs } from "./decorators/types";
import { DecafRequestContext } from "../request";
import { DECAF_CONTROLLER_CONFIG, DECAF_ROUTE } from "../constants";
import { SKIP_MODEL_ROLES_KEY } from "../auth/constants";
import { Auth, Public, RequireRoles } from "../auth/decorators";
import { ControllerConstructor } from "./types";
import { DecafModelController } from "../controllers";
import { DtoFor } from "../factory/openapi/DtoBuilder";
import "../overrides";
import {
  ModelControllerFactory,
  type ModelControllerFactoryConfig,
  type AuthConfig,
  type ServerRoute,
} from "@decaf-ts/for-http/server";

export class FromModelController {
  private static readonly log = Logging.for(FromModelController.name);

  private static toDecafError(
    error: unknown,
    fallbackMessage: string
  ): BaseError {
    if (error instanceof BaseError) return error;
    return new InternalError(
      error instanceof Error
        ? `${fallbackMessage}: ${error.message}`
        : fallbackMessage
    );
  }

  static getPersistence<T extends Model<boolean>>(
    ModelClazz: ModelConstructor<T>
  ): Repo<T> | ModelService<T> {
    try {
      return Service.get<ModelService<T>>(ModelClazz);
    } catch (e: unknown) {
      try {
        return ModelService.getService(ModelClazz) as ModelService<T>;
      } catch (e2: unknown) {
        return Repository.forModel(ModelClazz) as Repo<T>;
      }
    }
  }

  static createQueryRoutesFromRepository<T extends Model<boolean>>(
    persistence: Repo<T> | ModelService<T>,
    prefix: string = PersistenceKeys.QUERY
  ): ControllerConstructor<T> {
    const repo: Repo<T> =
      persistence instanceof ModelService ? persistence.repo : persistence;
    const queryMethods: Record<string, { fields?: string[] | undefined }> =
      Metadata.get(
        repo.constructor as Constructor,
        Metadata.key(PersistenceKeys.QUERY)
      ) ?? {};

    const routeMethods: Record<string, any> =
      Metadata.get(
        persistence.constructor as Constructor,
        Metadata.key(DECAF_ROUTE)
      ) ?? {};

    class QueryController extends DecafModelController<T> {
      override get class(): ModelConstructor<T> {
        throw new InternalError("Method not implemented.");
      }
      constructor(clientContext: DecafRequestContext, name: string) {
        super(clientContext, name);
      }
    }

    for (const [methodName, params] of Object.entries(routeMethods)) {
      const routePath = [params.path.replace(/^\/+|\/+$/g, "")]
        .filter((segment: string) => segment && segment.trim())
        .join("/");

      const handler = FromModelController.createComplexQueryHandler(
        methodName
      ) as any;
      FromModelController.defineMethod(QueryController, methodName, handler);

      const httpDecorator = HttpVerbToDecorator(params.httpMethod as HttpVerbs)(
        routePath || undefined
      );
      const decorators = FromModelController.getQueryDecorators(
        methodName,
        routePath,
        params.httpMethod
      );
      FromModelController.applyDecorators(QueryController, methodName, [
        httpDecorator,
        ...decorators,
      ]);
    }

    for (const [methodName, objValues] of Object.entries(queryMethods)) {
      const fields = objValues.fields ?? [];
      const routePath = [prefix, methodName, ...fields.map((f) => `:${f}`)]
        .filter((segment) => segment && segment.trim())
        .join("/");

      const handler = FromModelController.createComplexQueryHandler(
        methodName
      ) as any;
      FromModelController.defineMethod(QueryController, methodName, handler);

      const httpDecorator = HttpVerbToDecorator("GET" as HttpVerbs)(
        routePath || undefined
      );
      const decorators = FromModelController.getQueryDecorators(
        methodName,
        routePath,
        "GET",
        true
      );
      FromModelController.applyDecorators(QueryController, methodName, [
        httpDecorator,
        ...decorators,
      ]);
    }

    return QueryController;
  }

  static create<T extends Model<any>>(
    ModelConstr: ModelConstructor<T>,
    moduleConfigOverrides?: Record<string, ModelControllerFactoryConfig>,
    globalDefaults?: Partial<ModelControllerFactoryConfig>
  ): ControllerConstructor<T> {
    const log = FromModelController.log.for(FromModelController.create);
    const tableName = Model.tableName(ModelConstr);
    const routePath = toKebabCase(tableName);
    const modelClazzName = ModelConstr.name;
    const persistence = FromModelController.getPersistence(ModelConstr);

    // When persistence is a ModelService, the @query/@route metadata lives on
    // the underlying repository class (custom repo), not on ModelService itself.
    // Pass the repo to the factory so addComplexQueries() can discover them.
    const factoryPersistence =
      persistence instanceof ModelService ? persistence.repo : persistence;

    const decoratorConfig = Metadata.get(
      ModelConstr,
      Metadata.key(DECAF_CONTROLLER_CONFIG)
    ) as ModelControllerFactoryConfig | undefined;
    const moduleOverride = moduleConfigOverrides?.[ModelConstr.name];
    const mergedConfig: ModelControllerFactoryConfig = {
      ...(globalDefaults || {}),
      ...(decoratorConfig || {}),
      ...(moduleOverride || {}),
    };

    const FactoryController = ModelControllerFactory.create<T>(
      ModelConstr,
      factoryPersistence,
      mergedConfig
    );
    const factoryRoutes = (FactoryController as any).__routes__ as
      | ServerRoute[]
      | undefined;

    const {
      getPK,
      apiProperties,
      path: pkPath,
    } = FromModelController.getRouteParametersFromModel(ModelConstr);

    log.debug(
      `Creating controller for model: ${modelClazzName} with ${factoryRoutes?.length ?? 0} factory routes`
    );

    const authConfig: AuthConfig | undefined = mergedConfig.auth;

    function applyClassAuth(target: any) {
      if (authConfig?.public) {
        Public()(target);
      } else if (authConfig?.roles?.length) {
        RequireRoles(...authConfig.roles)(target);
      } else {
        Auth(ModelConstr)(target);
      }
      if (authConfig?.skipModelRoles) {
        SetMetadata(SKIP_MODEL_ROLES_KEY, true)(target);
      }
    }

    @Controller(routePath)
    @ApiTags(modelClazzName)
    @ApiExtraModels(ModelConstr)
    class DynamicModelController extends DecafModelController<T> {
      private readonly pk: string = Model.pk(ModelConstr) as string;

      protected static get class() {
        return ModelConstr;
      }

      override get class(): ModelConstructor<T> {
        return ModelConstr;
      }

      constructor(clientContext: DecafRequestContext) {
        super(clientContext, DynamicModelController.name);
        log.info(
          `Registering dynamic controller for model: ${this.class.name} route: /${routePath}`
        );
      }
    }

    applyClassAuth(DynamicModelController);

    if (factoryRoutes) {
      const sortedRoutes = [...factoryRoutes].sort((a, b) => {
        const aSegments = a.path.split("/").filter(Boolean);
        const bSegments = b.path.split("/").filter(Boolean);
        const aParamCount = aSegments.filter((s) => s.startsWith(":")).length;
        const bParamCount = bSegments.filter((s) => s.startsWith(":")).length;
        const aLiteralCount = aSegments.length - aParamCount;
        const bLiteralCount = bSegments.length - bParamCount;
        if (aLiteralCount !== bLiteralCount)
          return bLiteralCount - aLiteralCount;
        if (aParamCount !== bParamCount) return aParamCount - bParamCount;
        return 0;
      });

      for (const route of sortedRoutes) {
        const methodName =
          route.implementation?.name || route.method.toLowerCase();
        const registration = FromModelController.matchRoute(
          methodName,
          route,
          pkPath,
          apiProperties,
          getPK,
          ModelConstr,
          modelClazzName
        );
        if (!registration) continue;

        const {
          methodName: registeredMethodName,
          handler,
          decorators,
          paramDecorators,
        } = registration;

        const descriptor = FromModelController.defineMethod(
          DynamicModelController,
          registeredMethodName,
          handler
        );

        if (descriptor) {
          const httpDecorator = HttpVerbToDecorator(route.method as HttpVerbs)(
            route.path.replace(/^\/+|\/+$/g, "") || undefined
          );
          FromModelController.applyDecorators(
            DynamicModelController,
            registeredMethodName,
            [httpDecorator, ...decorators],
            paramDecorators
          );
        }
      }
    }

    return DynamicModelController as any;
  }

  static getRouteParametersFromModel<T extends Model<any>>(
    ModelClazz: ModelConstructor<T>
  ): {
    path: string;
    description: string;
    apiProperties: DecafApiProperty[];
    getPK: (...params: Array<string | number>) => string;
  } {
    const pk = Model.pk(ModelClazz) as keyof Model<any>;
    const composed = Metadata.get(
      ModelClazz,
      Metadata.key(DBKeys.COMPOSED, pk)
    );
    const composedKeys = composed?.args ?? [];

    const uniqueKeys =
      Array.isArray(composedKeys) && composedKeys.length > 0
        ? Array.from(new Set([...composedKeys]))
        : Array.from(new Set([pk]));

    const description = Metadata.description(ModelClazz) ?? "";
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

  private static routeParamDecorators(
    path: string
  ): Array<{ decorator: ParameterDecorator; index: number }> {
    let paramIndex = 0;
    return path
      .split("/")
      .filter(Boolean)
      .flatMap((segment) => {
        if (segment.startsWith(":")) {
          return [
            { decorator: Param(segment.slice(1)) as any, index: paramIndex++ },
          ];
        }
        if (segment.startsWith("*")) {
          return [
            { decorator: Param(segment.slice(1)) as any, index: paramIndex++ },
          ];
        }
        return [];
      });
  }

  private static defineMethod(
    target: any,
    methodName: string,
    handler: (...args: any[]) => any
  ): PropertyDescriptor | undefined {
    Object.defineProperty(target.prototype || target, methodName, {
      value: handler,
      writable: false,
      configurable: true,
      enumerable: false,
    });

    return Object.getOwnPropertyDescriptor(
      target.prototype || target,
      methodName
    );
  }

  private static applyDecorators(
    target: any,
    methodName: string,
    methodDecorators: Array<(target: any, key: string, desc: any) => void>,
    paramDecorators: Array<{
      decorator: ParameterDecorator;
      index: number;
    }> = []
  ) {
    const proto = target?.prototype ?? target;
    const descriptor = Object.getOwnPropertyDescriptor(proto, methodName);
    methodDecorators.forEach((d) => d(proto, methodName, descriptor));
    paramDecorators.forEach(({ decorator, index }) =>
      decorator(proto, methodName, index)
    );
  }

  private static matchRoute(
    methodName: string,
    route: ServerRoute,
    pkPath: string,
    apiProperties: DecafApiProperty[],
    getPK: (...p: Array<string | number>) => string,
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string
  ):
    | {
        methodName: string;
        handler: (...args: any[]) => any;
        decorators: Array<(target: any, key: string, desc: any) => void>;
        paramDecorators: Array<{
          decorator: ParameterDecorator;
          index: number;
        }>;
      }
    | undefined {
    const { method, path } = route;
    const normalizedPath = path.replace(/^\/+|\/+$/g, "");
    const handler = route.implementation as (...args: any[]) => any;

    if (method === "POST" && normalizedPath === "") {
      return FromModelController.createRegistration(
        "create",
        handler,
        FromModelController.createCreateDecorators(ModelConstr, modelClazzName),
        [
          { decorator: DecafBody() as any, index: 0 },
          { decorator: Response({ passthrough: true }) as any, index: 1 },
        ]
      );
    }

    if (method === "POST" && normalizedPath === "bulk") {
      return FromModelController.createRegistration(
        "createAll",
        handler,
        FromModelController.bulkCreateDecorators(ModelConstr, modelClazzName),
        [
          { decorator: DecafBody() as any, index: 0 },
          { decorator: Response({ passthrough: true }) as any, index: 1 },
        ]
      );
    }

    if (method === "GET" && normalizedPath === "bulk") {
      return FromModelController.createRegistration(
        "readAll",
        handler,
        FromModelController.bulkReadDecorators(ModelConstr, modelClazzName),
        [{ decorator: Query("ids") as any, index: 0 }]
      );
    }

    if (method === "PUT" && normalizedPath === "bulk") {
      return FromModelController.createRegistration(
        "updateAll",
        handler,
        FromModelController.bulkUpdateDecorators(
          ModelConstr,
          modelClazzName,
          apiProperties
        ),
        [
          { decorator: DecafBody() as any, index: 0 },
          { decorator: Response({ passthrough: true }) as any, index: 1 },
        ]
      );
    }

    if (method === "DELETE" && normalizedPath === "bulk") {
      return FromModelController.createRegistration(
        "deleteAll",
        handler,
        FromModelController.bulkDeleteDecorators(
          ModelConstr,
          modelClazzName,
          apiProperties
        ),
        [
          { decorator: Query("ids") as any, index: 0 },
          { decorator: Response({ passthrough: true }) as any, index: 1 },
        ]
      );
    }

    if (method === "GET" && normalizedPath === pkPath) {
      return FromModelController.createRegistration(
        "read",
        handler,
        FromModelController.readDecorators(
          ModelConstr,
          modelClazzName,
          apiProperties,
          pkPath
        ),
        FromModelController.routeParamDecorators(normalizedPath)
      );
    }

    if (method === "PUT" && normalizedPath === pkPath) {
      const routeParams =
        FromModelController.routeParamDecorators(normalizedPath);
      return FromModelController.createRegistration(
        "update",
        handler,
        FromModelController.updateDecorators(
          ModelConstr,
          modelClazzName,
          apiProperties,
          pkPath
        ),
        [
          { decorator: DecafBody() as any, index: 0 },
          ...routeParams.map(({ decorator, index }) => ({
            decorator,
            index: index + 1,
          })),
        ]
      );
    }

    if (method === "DELETE" && normalizedPath === pkPath) {
      const routeParams =
        FromModelController.routeParamDecorators(normalizedPath);
      return FromModelController.createRegistration(
        "delete",
        handler,
        FromModelController.deleteDecorators(
          ModelConstr,
          modelClazzName,
          apiProperties,
          pkPath
        ),
        routeParams
      );
    }

    // Composed PK fallback routes (filterEmpty) — path differs from pkPath
    const fallbackSegments = normalizedPath.split("/").filter(Boolean);
    const isAllParams =
      fallbackSegments.length > 0 &&
      fallbackSegments.every((s) => s.startsWith(":"));
    if (isAllParams && normalizedPath !== pkPath) {
      const fallbackApiProps = fallbackSegments
        .map((s) => s.slice(1))
        .map((name) => ({
          name,
          description: `${name} parameter`,
          required: true,
          type: String,
        }));
      const suffix = fallbackSegments.map((s) => s.slice(1)).join("And");
      const routeParams =
        FromModelController.routeParamDecorators(normalizedPath);
      if (method === "GET") {
        return FromModelController.createRegistration(
          `readBy${suffix}`,
          handler,
          FromModelController.readDecorators(
            ModelConstr,
            modelClazzName,
            fallbackApiProps,
            normalizedPath
          ),
          routeParams
        );
      }
      if (method === "PUT") {
        return FromModelController.createRegistration(
          `updateBy${suffix}`,
          handler,
          FromModelController.updateDecorators(
            ModelConstr,
            modelClazzName,
            fallbackApiProps,
            normalizedPath
          ),
          [
            { decorator: DecafBody() as any, index: 0 },
            ...routeParams.map(({ decorator, index }) => ({
              decorator,
              index: index + 1,
            })),
          ]
        );
      }
      if (method === "DELETE") {
        return FromModelController.createRegistration(
          `deleteBy${suffix}`,
          handler,
          FromModelController.deleteDecorators(
            ModelConstr,
            modelClazzName,
            fallbackApiProps,
            normalizedPath
          ),
          routeParams
        );
      }
    }

    if (method === "GET" && normalizedPath === "statement/:method/*args") {
      return FromModelController.createRegistration(
        "statement",
        handler,
        FromModelController.statementDecorators(ModelConstr, modelClazzName),
        [
          { decorator: Param("method") as any, index: 0 },
          { decorator: Param("args") as any, index: 1 },
          { decorator: DecafQuery() as any, index: 2 },
        ]
      );
    }

    if (method === "GET" && normalizedPath === "findOneBy/:key/:value") {
      return FromModelController.createRegistration(
        "findOneBy",
        handler,
        FromModelController.statementShortcutDecorators(
          ModelConstr,
          modelClazzName,
          normalizedPath,
          PreparedStatementKeys.FIND_ONE_BY
        ),
        FromModelController.statementShortcutParams(normalizedPath)
      );
    }

    const statementRoutes: Record<string, string> = {
      "listBy/:key": PreparedStatementKeys.LIST_BY,
      "paginateBy/:key/:page": PreparedStatementKeys.PAGE_BY,
      "find/:value": PreparedStatementKeys.FIND,
      "page/:value": PreparedStatementKeys.PAGE,
      "findOneBy/:key/:value": PreparedStatementKeys.FIND_ONE_BY,
      "findBy/:key/:value": PreparedStatementKeys.FIND_BY,
      "countOf/:field": PreparedStatementKeys.COUNT_OF,
      "maxOf/:field": PreparedStatementKeys.MAX_OF,
      "minOf/:field": PreparedStatementKeys.MIN_OF,
      "avgOf/:field": PreparedStatementKeys.AVG_OF,
      "sumOf/:field": PreparedStatementKeys.SUM_OF,
      "distinctOf/:field": PreparedStatementKeys.DISTINCT_OF,
      "groupOf/:field": PreparedStatementKeys.GROUP_OF,
    };

    const statementKey = statementRoutes[normalizedPath];
    if (statementKey && method === "GET") {
      return FromModelController.createRegistration(
        FromModelController.statementMethodName(normalizedPath),
        handler,
        FromModelController.statementShortcutDecorators(
          ModelConstr,
          modelClazzName,
          normalizedPath,
          statementKey
        ),
        FromModelController.statementShortcutParams(normalizedPath)
      );
    }

    if (method === "GET" && normalizedPath.startsWith("query/")) {
      const queryMethod = normalizedPath.replace(/^query\//, "").split("/")[0];
      return FromModelController.createRegistration(
        queryMethod,
        handler,
        FromModelController.getQueryDecorators(
          queryMethod,
          normalizedPath,
          "GET",
          true
        ),
        FromModelController.complexQueryParams(normalizedPath)
      );
    }

    const pathSegments = normalizedPath.split("/").filter(Boolean);
    const knownPrefixes = new Set<string>([
      "listBy",
      "findBy",
      "findByPaginate",
      "findOneBy",
      "paginateBy",
      "find",
      "page",
      "countOf",
      "maxOf",
      "minOf",
      "avgOf",
      "sumOf",
      "distinctOf",
      "groupOf",
      "statement",
      "bulk",
      "query",
    ]);
    if (
      pathSegments.length > 0 &&
      !normalizedPath.startsWith("query/") &&
      !normalizedPath.startsWith("statement/") &&
      !knownPrefixes.has(pathSegments[0])
    ) {
      const apiPathParams = pathSegments
        .filter((s) => s.startsWith(":"))
        .map((s) => s.slice(1))
        .map((name) => ({
          name,
          description: `${name} parameter for the query`,
          required: true,
          type: String,
        }));

      return FromModelController.createRegistration(
        methodName,
        handler,
        [
          ...apiPathParams.map((p) => ApiParam(p)),
          ApiOperation({ summary: `Retrieve records using "${methodName}".` }),
          ApiOkResponse({ description: "Result successfully retrieved." }),
          ApiNoContentResponse({
            description: "No content returned by the method.",
          }),
        ],
        FromModelController.routeParamDecorators(normalizedPath)
      );
    }

    return undefined;
  }

  private static createRegistration(
    methodName: string,
    handler: (...args: any[]) => any,
    decorators: Array<(target: any, key: string, desc: any) => void>,
    paramDecorators: Array<{ decorator: ParameterDecorator; index: number }>
  ) {
    return { methodName, handler, decorators, paramDecorators };
  }

  private static statementMethodName(path: string): string {
    const firstSegment = path.split("/")[0];
    return firstSegment;
  }

  private static statementShortcutParams(
    path: string
  ): Array<{ decorator: ParameterDecorator; index: number }> {
    const segments = path.split("/").filter((s) => s.startsWith(":"));
    const params: Array<{ decorator: ParameterDecorator; index: number }> = [];
    segments.forEach((seg, i) => {
      const name = seg.replace(":", "");
      params.push({ decorator: Param(name) as any, index: i });
    });
    if (
      path.startsWith("listBy/") ||
      path.startsWith("paginateBy/") ||
      path.startsWith("find/") ||
      path.startsWith("page/")
    ) {
      params.push({ decorator: DecafQuery() as any, index: segments.length });
    }
    return params;
  }

  private static complexQueryParams(
    path: string
  ): Array<{ decorator: ParameterDecorator; index: number }> {
    const segments = path.split("/").filter((s) => s.startsWith(":"));
    const params: Array<{ decorator: ParameterDecorator; index: number }> = [];
    segments.forEach((seg, i) => {
      const name = seg.replace(":", "");
      params.push({ decorator: Param(name) as any, index: i });
    });
    if (path.startsWith("query/")) {
      params.push({ decorator: DecafQuery() as any, index: segments.length });
    }
    return params;
  }

  private static createComplexQueryHandler(methodName: string) {
    return async function complexQuery(
      this: any,
      ...args: any[]
    ): Promise<any> {
      const log: any = this.log?.for?.(complexQuery);
      try {
        if (log) log.debug(`Invoking custom query "${methodName}"`);
        const { ctx } = (await this.logCtx([], methodName, true)).for(
          complexQuery
        );
        const persistence = this.persistence(ctx);
        const spreadArgs = FromModelController.normalizeQueryArgs(args);
        if (
          persistence?.repo &&
          typeof persistence.repo[methodName] === "function"
        ) {
          return persistence.repo[methodName](...spreadArgs);
        }
        if (typeof persistence[methodName] === "function") {
          return persistence[methodName](...spreadArgs);
        }
        if (persistence?.query && typeof persistence.query === "function") {
          return persistence.query(methodName, ...spreadArgs);
        }
        if (typeof persistence.statement === "function") {
          return persistence.statement(methodName, ...spreadArgs, ctx);
        }
        throw new InternalError(
          `Persistence method "${methodName}" not found on ${persistence?.constructor?.name}`
        );
      } catch (e: any) {
        if (log) log.error(`Custom query "${methodName}" failed`, e);
        throw FromModelController.toDecafError(
          e,
          `Custom query "${methodName}" failed`
        );
      }
    };
  }

  private static extractQueryArgs(args: any[]): any[] {
    if (args.length === 0) return args;
    const last = args[args.length - 1];
    if (last && typeof last === "object" && !Array.isArray(last)) {
      const queryObj = args.pop();
      const hasDirection = queryObj.direction !== undefined;
      const hasLimit = queryObj.limit !== undefined;
      const hasOffset = queryObj.offset !== undefined;
      if (!hasDirection && !hasLimit && !hasOffset) return args;
      const extras: any[] = [];
      if (hasDirection) extras.push(queryObj.direction);
      else if (hasLimit || hasOffset) extras.push(undefined);
      if (hasLimit) extras.push(queryObj.limit);
      if (hasOffset) extras.push(queryObj.offset);
      return [...args, ...extras];
    }
    return args;
  }

  private static normalizeQueryArgs(args: any[]): any[] {
    const normalized = FromModelController.extractQueryArgs(args);
    if (normalized.length === 0) return normalized;

    const last = normalized[normalized.length - 1];
    if (!last || typeof last !== "object" || Array.isArray(last)) {
      return normalized;
    }

    const queryObj = last as Record<string, any>;
    const hasQueryFields =
      queryObj.direction !== undefined ||
      queryObj.limit !== undefined ||
      queryObj.offset !== undefined ||
      queryObj.bookmark !== undefined;

    if (!hasQueryFields) {
      normalized.pop();
      return normalized;
    }

    normalized.pop();
    if (queryObj.direction !== undefined) normalized.push(queryObj.direction);
    if (queryObj.limit !== undefined) normalized.push(queryObj.limit);
    if (queryObj.offset !== undefined) normalized.push(queryObj.offset);
    if (queryObj.bookmark !== undefined) normalized.push(queryObj.bookmark);
    return normalized;
  }

  private static createCreateDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "POST"),
      ApiOperation({ summary: `Create a new ${modelClazzName}.` }),
      ApiBody({
        description: `Payload for ${modelClazzName}`,
        type: DtoFor(OperationKeys.CREATE, ModelConstr),
      }),
      ApiCreatedResponse({
        description: `${modelClazzName} created successfully.`,
        schema: { $ref: getSchemaPath(ModelConstr) },
      }),
      ApiBadRequestResponse({ description: "Payload validation failed." }),
      ApiUnprocessableEntityResponse({
        description: "Repository rejected the provided payload.",
      }),
    ];
  }

  private static bulkCreateDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "POST", "bulk"),
      ApiOperation({ summary: `Create a new ${modelClazzName}.` }),
      ApiBody({
        description: `Payload for ${modelClazzName}`,
        schema: {
          type: "array",
          items: { $ref: getSchemaPath(ModelConstr) },
        },
      }),
      ApiCreatedResponse({
        description: `${modelClazzName} created successfully.`,
        schema: {
          type: "array",
          items: { $ref: getSchemaPath(ModelConstr) },
        },
      }),
      ApiBadRequestResponse({ description: "Payload validation failed." }),
      ApiUnprocessableEntityResponse({
        description: "Repository rejected the provided payload.",
      }),
    ];
  }

  private static bulkReadDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "GET", "bulk"),
      ApiOperation({ summary: `Retrieve ${modelClazzName} records by ids.` }),
      ApiQuery({ name: "ids", required: true, type: "array" }),
      ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
        schema: {
          type: "array",
          items: { $ref: getSchemaPath(ModelConstr) },
        },
      }),
      ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      }),
    ];
  }

  private static bulkUpdateDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string,
    apiProperties: DecafApiProperty[]
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "PUT", "bulk"),
      ApiParamsFromModel(apiProperties),
      ApiOperation({
        summary: `Replace existing ${modelClazzName} records with new payloads.`,
      }),
      ApiBody({
        description: `Payload for replacing existing records of ${modelClazzName}`,
        schema: {
          type: "array",
          $ref: getSchemaPath(DtoFor(OperationKeys.UPDATE, ModelConstr)),
        },
      }),
      ApiOkResponse({
        description: `${modelClazzName} updated successfully.`,
        schema: {
          type: "array",
          items: { $ref: getSchemaPath(ModelConstr) },
        },
      }),
      ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      }),
      ApiBadRequestResponse({ description: "Payload validation failed." }),
    ];
  }

  private static bulkDeleteDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string,
    apiProperties: DecafApiProperty[]
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "DELETE", "bulk"),
      ApiParamsFromModel(apiProperties),
      ApiOperation({ summary: `Delete ${modelClazzName} records by ids.` }),
      ApiQuery({ name: "ids", required: true, type: "array" }),
      ApiOkResponse({
        description: `${modelClazzName} deleted successfully.`,
        schema: {
          type: "array",
          items: { $ref: getSchemaPath(ModelConstr) },
        },
      }),
      ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      }),
    ];
  }

  private static readDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string,
    apiProperties: DecafApiProperty[],
    pkPath: string
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "GET", pkPath),
      ApiParamsFromModel(apiProperties),
      ApiOperation({ summary: `Retrieve a ${modelClazzName} record by id.` }),
      ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
        schema: { $ref: getSchemaPath(ModelConstr) },
      }),
      ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      }),
    ];
  }

  private static updateDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string,
    apiProperties: DecafApiProperty[],
    pkPath: string
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "PUT", pkPath),
      ApiParamsFromModel(apiProperties),
      ApiOperation({
        summary: `Replace an existing ${modelClazzName} record with a new payload.`,
      }),
      ApiBody({
        description: `Payload for replacing an existing record of ${modelClazzName}`,
        type: DtoFor(OperationKeys.UPDATE, ModelConstr),
      }),
      ApiOkResponse({
        description: `${modelClazzName} updated successfully.`,
        schema: { $ref: getSchemaPath(ModelConstr) },
      }),
      ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      }),
      ApiBadRequestResponse({ description: "Payload validation failed." }),
    ];
  }

  private static deleteDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string,
    apiProperties: DecafApiProperty[],
    pkPath: string
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "DELETE", pkPath),
      ApiParamsFromModel(apiProperties),
      ApiOperation({ summary: `Delete a ${modelClazzName} record by id.` }),
      ApiOkResponse({
        description: `${modelClazzName} deleted successfully.`,
        schema: { $ref: getSchemaPath(ModelConstr) },
      }),
      ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      }),
    ];
  }

  private static statementDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string
  ): Array<(target: any, key: string, desc: any) => void> {
    return [
      ApiOperationFromModel(ModelConstr, "GET", "statement/:method/*args"),
      ApiOperation({
        summary: `Executes a prepared statement on ${modelClazzName}.`,
      }),
      ApiParam({
        name: "method",
        description: "the prepared statement to execute",
      }),
      ApiParam({
        name: "args",
        description:
          "concatenated list of arguments the prepared statement can accept",
      }),
      ApiQuery({
        name: "direction",
        required: true,
        enum: OrderDirection,
        description: "the sort order when applicable",
      }),
      ApiQuery({
        name: "limit",
        required: true,
        description: "limit or page size when applicable",
      }),
      ApiQuery({
        name: "offset",
        required: true,
        description: "offset or bookmark when applicable",
      }),
      ApiOkResponse({ description: `${modelClazzName} listed found.` }),
      ApiNotFoundResponse({
        description: `No ${modelClazzName} record matches the provided identifier.`,
      }),
    ];
  }

  private static statementShortcutDecorators(
    ModelConstr: ModelConstructor<any>,
    modelClazzName: string,
    path: string,
    statementKey: string
  ): Array<(target: any, key: string, desc: any) => void> {
    const base: Array<(target: any, key: string, desc: any) => void> = [
      ApiOperationFromModel(ModelConstr, "GET", path),
      ApiOperation({ summary: `Retrieve ${modelClazzName} records.` }),
      ApiOkResponse({
        description: `${modelClazzName} retrieved successfully.`,
      }),
    ];

    const segments = path.split("/").filter((s) => s.startsWith(":"));
    segments.forEach((seg) => {
      const name = seg.replace(":", "");
      base.push(ApiParam({ name, description: `The ${name} parameter` }));
    });

    if (
      path.startsWith("listBy/") ||
      path.startsWith("paginateBy/") ||
      path.startsWith("find/") ||
      path.startsWith("page/")
    ) {
      base.push(
        ApiQuery({
          name: "direction",
          required: true,
          enum: OrderDirection,
          description: "the sort order",
        })
      );
    }
    if (path.startsWith("paginateBy/") || path.startsWith("page/")) {
      base.push(
        ApiQuery({ name: "limit", required: false, description: "page size" }),
        ApiQuery({
          name: "offset",
          required: false,
          description: "page number",
        }),
        ApiQuery({
          name: "bookmark",
          required: false,
          description: "bookmark for cursor pagination",
        })
      );
    }

    if (path.startsWith("findOneBy/") || path.startsWith("findBy/")) {
      base.push(
        ApiNotFoundResponse({
          description: `No ${modelClazzName} record matches the provided identifier.`,
        })
      );
    }

    if (
      statementKey === PreparedStatementKeys.COUNT_OF ||
      statementKey === PreparedStatementKeys.AVG_OF ||
      statementKey === PreparedStatementKeys.SUM_OF
    ) {
      base.push(
        ApiOkResponse({
          description: `Result for ${modelClazzName}.`,
          type: Number,
        })
      );
    }
    if (statementKey === PreparedStatementKeys.DISTINCT_OF) {
      base.push(
        ApiOkResponse({
          description: `Distinct values for ${modelClazzName}.`,
          type: [String],
        })
      );
    }

    return base;
  }

  private static getQueryDecorators(
    methodName: string,
    routePath: string,
    httpVerb: string,
    includeQueryParams: boolean = false
  ): Array<(target: any, key: string, desc: any) => void> {
    const extractPathParams = (p: string): string[] =>
      p
        .split("/")
        .filter((s) => s.startsWith(":"))
        .map((s) => s.slice(1));

    const apiPathParams = extractPathParams(routePath).map((name) => ({
      name,
      description: `${name} parameter for the query`,
      required: true,
      type: String,
    }));

    const decorators: Array<(target: any, key: string, desc: any) => void> = [
      ...apiPathParams.map((p) => ApiParam(p)),
      ApiOperation({ summary: `Retrieve records using "${methodName}".` }),
      ApiOkResponse({ description: "Result successfully retrieved." }),
      ApiNoContentResponse({
        description: "No content returned by the method.",
      }),
    ];

    if (httpVerb === "GET" && includeQueryParams) {
      decorators.push(
        ApiQuery({
          name: "direction",
          required: false,
          enum: OrderDirection,
          description: "the sort order when applicable",
        }),
        ApiQuery({
          name: "limit",
          required: false,
          description: "limit or page size",
        }),
        ApiQuery({
          name: "offset",
          required: false,
          description: "offset or bookmark",
        })
      );
    }

    return decorators;
  }
}
