import {
  ContextOf,
  ContextualizedArgs,
  ContextualLoggedClass,
  FlagsOf,
  MaybeContextualArg,
  MethodOrOperation,
  ModelService,
  Repo,
  Service,
} from "@decaf-ts/core";
import { DECAF_ADAPTER_OPTIONS, DecafServerContext } from "./constants";
import { Model, ModelConstructor } from "@decaf-ts/decorator-validation";
import { FromModelController } from "./decaf-model/index";
import { DecafRequestContext } from "./request/index";

export abstract class DecafController<
  CONTEXT extends DecafServerContext,
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
    return ContextualLoggedClass.logCtx.call(
      this,
      operation,
      overrides || {},
      allowCreate,
      ...args.filter((e) => typeof e !== "undefined")
    ) as
      | Promise<
          ContextualizedArgs<
            CONTEXT,
            ARGS,
            METHOD extends string ? true : false
          >
        >
      | ContextualizedArgs<CONTEXT, ARGS, METHOD extends string ? true : false>;
  }
}

export abstract class DecafModelController<
  M extends Model<boolean>,
  C extends DecafServerContext = DecafServerContext,
> extends DecafController<C> {
  private _persistence?: Repo<M> | ModelService<M>;

  abstract get class(): ModelConstructor<M>;

  get persistence() {
    if (!this._persistence)
      this._persistence = FromModelController.getPersistence(this.class);
    return this._persistence;
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
    ContextOf<this["persistence"]>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<this["persistence"]>, ARGS>,
    operation: METHOD,
    allowCreate: false
  ): ContextualizedArgs<
    ContextOf<this["persistence"]>,
    ARGS,
    METHOD extends string ? true : false
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<this["persistence"]>, ARGS>,
    operation: METHOD,
    allowCreate: true
  ): Promise<
    ContextualizedArgs<
      ContextOf<this["persistence"]>,
      ARGS,
      METHOD extends string ? true : false
    >
  >;
  protected override logCtx<
    ARGS extends any[] = any[],
    METHOD extends MethodOrOperation = MethodOrOperation,
  >(
    args: MaybeContextualArg<ContextOf<this["persistence"]>, ARGS>,
    operation: METHOD,
    allowCreate: boolean = false
  ):
    | Promise<
        ContextualizedArgs<
          ContextOf<this["persistence"]>,
          ARGS,
          METHOD extends string ? true : false
        >
      >
    | ContextualizedArgs<
        ContextOf<this["persistence"]>,
        ARGS,
        METHOD extends string ? true : false
      > {
    // TODO get nestJS context

    const adapterOptions = this.clientContext.get(DECAF_ADAPTER_OPTIONS);

    if (!allowCreate)
      return (this.persistence as any)["logCtx"](
        args,
        operation,
        allowCreate as any,
        adapterOptions || {}
      ) as any;

    return Promise.resolve(
      (this.persistence as any)["logCtx"](
        args,
        operation,
        allowCreate as any,
        adapterOptions || {}
      )
    ) as any;
  }
}
