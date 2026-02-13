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
    return ContextualLoggedClass.logCtx.call(
      this,
      operation,
      overrides || {},
      allowCreate,
      ...[...args, ctx]
    ) as any;
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
    allowCreate: false
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
    allowCreate: true
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
    allowCreate: boolean = false
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
    let overrides: Record<string, any> = {};
    try {
      overrides = ctx.get("overrides");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e: unknown) {
      // do nothing
    }
    const persistence = this.persistence(ctx);
    let contextual: Contextual | undefined = undefined;
    if (persistence instanceof ModelService)
      contextual = persistence.repo["adapter"];
    else if (persistence instanceof Repository)
      contextual = persistence["adapter"];
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

      return ctxArgs as any;
    }

    return (
      ((contextual as Adapter<any, any, any, any>)["logCtx"] as any)(
        args,
        operation,
        true,
        overrides
      ) as unknown as Promise<ContextualizedArgs<any>>
    ).then((ctxArgs) => {
      return ctxArgs;
    }) as any;
  }
}
