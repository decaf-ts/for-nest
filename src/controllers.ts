import { type Request } from "express";
import { DecafController as HttpDecafController } from "@decaf-ts/for-http/server";
import {
  Context,
  ContextualLoggedClass,
  ContextualizedArgs,
  FlagsOf,
  ModelService,
  MaybeContextualArg,
  MethodOrOperation,
  Repo,
  Repository,
  Service,
} from "@decaf-ts/core";
import { Model, type ModelConstructor } from "@decaf-ts/decorator-validation";

import { DECAF_ADAPTER_OPTIONS, DecafServerCtx } from "./constants";
import { DecafRequestContext } from "./request/DecafRequestContext";

export abstract class DecafController<
  CONTEXT extends DecafServerCtx = DecafServerCtx,
> extends HttpDecafController<Request, any, DecafRequestContext> {
  protected constructor(
    protected readonly clientContext: DecafRequestContext,
    _name: string
  ) {
    super(clientContext);
  }
}

export abstract class DecafModelController<
  M extends Model<boolean>,
  C extends DecafServerCtx = DecafServerCtx,
> extends DecafController<C> {
  private _persistence?: Repo<M> | ModelService<M>;

  protected constructor(
    protected override readonly clientContext: DecafRequestContext,
    _name: string
  ) {
    super(clientContext, _name);
  }

  abstract get class(): ModelConstructor<M>;

  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<any, ARGS>,
    operation: METHOD
  ): ContextualizedArgs<
    ContextualizedArgs<any, any>["ctx"],
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<any, ARGS>,
    operation: METHOD,
    allowCreate: false,
    overrides?: Partial<FlagsOf<any>>
  ): ContextualizedArgs<
    ContextualizedArgs<any, any>["ctx"],
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<any, ARGS>,
    operation: METHOD,
    allowCreate: true,
    overrides?: Partial<FlagsOf<any>>
  ): Promise<
    ContextualizedArgs<
      ContextualizedArgs<any, any>["ctx"],
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    CREATE extends boolean = false,
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<any, ARGS>,
    operation: METHOD,
    allowCreate: CREATE = false as CREATE,
    overrides?: Partial<FlagsOf<any>>
  ):
    | Promise<
        ContextualizedArgs<
          ContextualizedArgs<any, any>["ctx"],
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextualizedArgs<any, any>["ctx"],
        ARGS,
        METHOD extends string ? true : false
      > {
    const ctx = this.clientContext.ctx;
    args = args.filter((e) => typeof e !== "undefined");

    let request: Request | undefined = undefined;
    if (overrides && ((overrides as any).headers || (overrides as any).ip)) {
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

  persistence(ctx?: Context<any>): Repo<M> | ModelService<M> {
    if (!this._persistence)
      try {
        this._persistence = Service.get<ModelService<M>>(this.class);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (e: unknown) {
        try {
          this._persistence = ModelService.getService(
            this.class
          ) as ModelService<M>;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e: unknown) {
          this._persistence = Repository.forModel(this.class) as Repo<M>;
        }
      }

    const certs = (this.clientContext.request as any)[DECAF_ADAPTER_OPTIONS] || {};
    if (ctx) {
      this.clientContext.put(certs);
    }

    return ctx
      ? this._persistence instanceof Repository
        ? this._persistence.override(certs)
        : this._persistence.for(certs)
      : this._persistence;
  }
}
