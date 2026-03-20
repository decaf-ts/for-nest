import {
  Adapter,
  Context,
  ContextOf,
  ContextualizedArgs,
  ContextualLoggedClass,
  FlagsOf,
  MaybeContextualArg,
  MethodOrOperation,
  ModelService,
  Repo,
  Repository,
  Service,
} from "@decaf-ts/core";
import { LoggingConfig, Logger } from "@decaf-ts/logging";
import { type Request } from "express";
import { DECAF_ADAPTER_OPTIONS, DecafServerCtx } from "./constants";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { DecafRequestContext } from "./request/DecafRequestContext";
import { Contextual } from "@decaf-ts/db-decorators";
import { Constructor } from "@decaf-ts/decoration";

export abstract class DecafController<
  CONTEXT extends DecafServerCtx,
> extends Service<CONTEXT> {
  protected constructor(
    protected readonly clientContext: DecafRequestContext,
    name: string
  ) {
    super(name);
  }
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ): Promise<
    ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
  >;
  protected override logCtx<
    CREATE extends boolean = false,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<CONTEXT, ARGS>,
    operation: METHOD,
    allowCreate: CREATE = false as CREATE,
    overrides?: Partial<FlagsOf<CONTEXT>>
  ):
    | Promise<
        ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>
      >
    | ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false> {
    const ctx = this.clientContext.ctx;
    args = args.filter((e) => typeof e !== "undefined");

    let request: Request | undefined = undefined;
    if (overrides && (overrides.headers || (overrides as any).ip)) {
      request = overrides as any;
      overrides = {};
    }

    const result = ContextualLoggedClass.logCtx.call(
      this,
      operation,
      overrides || {},
      allowCreate,
      ...[...args, ctx]
    ) as any;
    return this.bindLoggerToRequest(result, request);
  }

  protected bindLoggerToRequest<RESULT extends ContextualizedArgs<any, any>>(
    value: RESULT | Promise<RESULT>,
    request?: Request
  ): RESULT | Promise<RESULT> {
    const self = this;
    function applyRequestIp<RESULT extends ContextualizedArgs<any, any>>(
      ctxArgs: RESULT,
      request?: Request
    ): RESULT {
      ctxArgs.log = decorateLoggerWithIp(ctxArgs.log, request);
      return ctxArgs;
    }

    function decorateLoggerWithIp(log: Logger, request?: Request): Logger {
      const ip = extractRequestIp(
        request ?? (self.clientContext.request as Request | undefined)
      );
      if (!ip) return log;
      const config = { ip } as Partial<LoggingConfig> & { ip: string };
      return log.for(config);
    }

    if (isPromise(value)) {
      return value.then((ctxArgs) => applyRequestIp(ctxArgs, request));
    }
    return applyRequestIp(value, request);
  }
}

export abstract class DecafModelController<
  M extends Model<boolean>,
  C extends DecafServerCtx = DecafServerCtx,
> extends DecafController<C> {
  private _persistence?: Repo<M> | ModelService<M>;

  abstract get class(): ModelConstructor<M>;

  persistence(ctx?: Context<any>): Repo<M> | ModelService<M> {
    if (!this._persistence)
      try {
        this._persistence = ModelService.getService(
          this.class
        ) as ModelService<M>;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: unknown) {
        try {
          this._persistence = Service.get(
            this.class as Constructor
          ) as ModelService<M>;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
          this._persistence = Repository.forModel(this.class) as Repo<M>;
        }
      }

    const certs = this.clientContext.request[DECAF_ADAPTER_OPTIONS] || {};
    if (ctx) {
      this.clientContext.put(certs);
    }

    return ctx
      ? this._persistence instanceof Repository
        ? this._persistence.override(certs)
        : this._persistence.for(certs)
      : this._persistence;
  }

  protected constructor(clientContext: DecafRequestContext, name: string) {
    super(clientContext, name);
  }

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<any, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextOf<ReturnType<this["persistence"]>>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<ReturnType<this["persistence"]>>, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<ContextOf<ReturnType<this["persistence"]>>>>
  ): ContextualizedArgs<
    ContextOf<ReturnType<this["persistence"]>>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<ReturnType<this["persistence"]>>, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<ContextOf<ReturnType<this["persistence"]>>>>
  ): Promise<
    ContextualizedArgs<
      ContextOf<ReturnType<this["persistence"]>>,
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<ReturnType<this["persistence"]>>, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false,
    overrides?: Partial<FlagsOf<ContextOf<ReturnType<this["persistence"]>>>>
  ):
    | Promise<
        ContextualizedArgs<
          ContextOf<ReturnType<this["persistence"]>>,
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextOf<any>,
        ARGS,
        METHOD extends string ? true : false
      > {
    // TODO get nestJS context

    const ctx = this.clientContext.ctx;

    let request: Request | undefined = undefined;
    if (overrides && ((overrides as any).headers || (overrides as any).ip)) {
      request = overrides as any;
      overrides = {};
    }

    try {
      overrides = ctx.get("overrides") as any;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      // do nothing
    }
    const persistence = this.persistence(ctx);
    let contextual: Contextual | undefined = undefined;
    if (persistence instanceof ModelService)
      contextual = persistence.repo["_adapter"];
    else if (persistence instanceof Repository)
      contextual = persistence["_adapter"];
    else if ((persistence as unknown as Contextual<any>).context) {
      contextual = persistence;
    }

    let ctxArgs: ContextualizedArgs<any>;

    if (!allowCreate) {
      ctxArgs = ((contextual as Adapter<any, any, any, any>)["logCtx"] as any)(
        args,
        operation,
        false,
        overrides
      );

      return this.bindLoggerToRequest(ctxArgs, request) as any;
    }

    return (
      ((contextual as Adapter<any, any, any, any>)["logCtx"] as any)(
        args,
        operation,
        true,
        overrides
      ) as unknown as Promise<ContextualizedArgs<any>>
    ).then((ctxArgs) => this.bindLoggerToRequest(ctxArgs, request)) as any;
  }
}

function parseIpHeader(value?: string | string[]): string | undefined {
  if (!value) return undefined;
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)[0];
}

function extractRequestIp(req?: Request | Record<string | symbol, any>) {
  if (!req) return undefined;
  const headers = (req as Request).headers as Record<
    string,
    string | string[] | undefined
  >;
  const forwarded =
    parseIpHeader(headers?.["x-forwarded-for"]) ??
    parseIpHeader(headers?.["x-real-ip"]) ??
    parseIpHeader(headers?.["X-Forwarded-For"]) ??
    parseIpHeader(headers?.["X-Real-IP"]);
  if (forwarded) return forwarded;
  if (
    typeof (req as Request).ip === "string" &&
    ((req as Request).ip as any).length
  )
    return (req as Request).ip;
  const socket = (req as Request).socket || (req as any).connection;
  if (
    socket &&
    typeof socket.remoteAddress === "string" &&
    socket.remoteAddress.length
  )
    return socket.remoteAddress;
  return undefined;
}

function isPromise(value: unknown): value is Promise<any> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Promise<any>).then === "function"
  );
}
