### How to Use

- [Initial Setup](./workdocs/tutorials/For%20Developers.md#_initial-setup_)
- [Installation](./workdocs/tutorials/For%20Developers.md#installation)
- [Scripts](./workdocs/tutorials/For%20Developers.md#scripts)
- [Linting](./workdocs/tutorials/For%20Developers.md#testing)
- [CI/CD](./workdocs/tutorials/For%20Developers.md#continuous-integrationdeployment)
- [Publishing](./workdocs/tutorials/For%20Developers.md#publishing)
- [Structure](./workdocs/tutorials/For%20Developers.md#repository-structure)
- [IDE Integrations](./workdocs/tutorials/For%20Developers.md#ide-integrations)
  - [VSCode(ium)](./workdocs/tutorials/For%20Developers.md#visual-studio-code-vscode)
  - [WebStorm](./workdocs/tutorials/For%20Developers.md#webstorm)
- [Considerations](./workdocs/tutorials/For%20Developers.md#considerations)

---

## Module Configuration

### `DecafModule.forRootAsync(options)`

The main entry point. Boots persistence, registers controllers, and wires the request pipeline.

```ts
import { DecafModule } from "@decaf-ts/for-nest";

@Module({
  imports: [
    DecafModule.forRootAsync({
      conf: [
        [FabricClientAdapter, fabricConfig, new FabricTransformer()],
        [TypeORMAdapter, pgConfig, new TypeORMTransformer()],
        [NanoAdapter, couchConfig, new NanoTransformer()],
      ],
      autoControllers: true,
      aggregations: false,
      handlers: [ImpersonateHandler],
      controllerExposure: { Product: true, Batch: ["hlf-fabric"] },
      controllerConfig: { Product: { auth: { public: true } } },
      observerOptions: { enableObserverEvents: true },
      initialization: async () => { await Service.boot(); },
    }),
  ],
})
export class AppModule {}
```

#### `DecafModuleOptions`

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `conf` | `[Constructor<Adapter>, ConfigOf<Adapter>, ...any[], Transformer?][]` | Yes | — | Array of adapter tuples: `[AdapterClass, adapterConfig, ...args, transformer?]`. The trailing transformer (instance or constructor) maps request context fields to adapter-specific keys. If omitted, the adapter's registered `@requestToContextTransformer` is used. |
| `autoControllers` | `boolean` | Yes | — | When `true`, auto-generates CRUD controllers for all models registered to each adapter flavour. |
| `autoServices` | `boolean` | No | `false` | When `true`, generates a `ModelService` provider for every tracked model (injectable as `${ModelName}Service`). |
| `aggregations` | `boolean` | No | `true` | When `false`, disables grouping/aggregation routes globally by setting `allowGroupingQueries: false` as a `globalDefaults` override. |
| `controllerExposure` | `Record<string, boolean \| string[]>` | No | — | Per-model exposure overrides. `true` exposes on all flavours; an array of flavour strings restricts exposure; `false` hides the model. When omitted, the `@expose` decorator metadata is used. |
| `controllerConfig` | `Record<string, ModelControllerFactoryConfig>` | No | — | Per-model controller factory config. Merged on top of decorator-level `@controllerConfig` and `globalDefaults`. See [ModelControllerFactoryConfig](#modelcontrollerfactoryconfig) below. |
| `observerOptions` | `ObserverEventsOptions` | No | — | SSE observer event configuration. See [ObserverEventsOptions](#observereventsoptions) below. |
| `handlers` | `Type<DecafRequestHandler>[]` | No | `[]` | Request handlers executed by `DecafHandlerExecutor` before the controller method. Each handler receives `(context, req, res)`. |
| `initialization` | `() => Promise<void>` | No | — | Called once after persistence boots but before the Nest module finishes initializing. Use for `Service.boot()` or similar setup. |
| `alias` | `string` | No | — | Optional adapter alias for multi-instance scenarios. |

#### `ModelControllerFactoryConfig`

Per-controller knobs merged in this priority order (later wins):

1. `globalDefaults` (from `aggregations: false`)
2. `@controllerConfig()` decorator on the model class
3. `controllerConfig[modelName]` in `DecafModuleOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `allowStatementlessQuery` | `boolean` | `false` | Allows `@query()` methods without a matching `@statement()` to be exposed as GET routes. |
| `allowGroupingQueries` | `boolean \| GroupingQueryFlags` | `true` | Enables or fine-tunes aggregation endpoints (`count`, `avg`, `max`, `min`, `sum`, `distinct`, `group`). Set to `false` to hide all aggregation routes. |
| `allowBulkStatement` | `boolean \| BulkStatementFlags` | `false` | Enables or fine-tunes bulk CRUD routes (`bulk` path: GET=readAll, PUT=updateAll, DELETE=deleteAll). |
| `auth` | `AuthConfig` | — | Per-controller auth configuration. See [AuthConfig](#authconfig) below. |

**`GroupingQueryFlags`**: `{ count?: boolean; avg?: boolean; max?: boolean; min?: boolean; sum?: boolean; distinct?: boolean; group?: boolean }`

**`BulkStatementFlags`**: `{ create?: boolean; read?: boolean; update?: boolean; delete?: boolean }`

#### `AuthConfig`

Applied at the **class level** to every auto-generated controller for that model:

| Option | Type | Default | Description |
|---|---|---|---|
| `public` | `boolean` | `false` | When `true`, applies `@Public()` — the `AuthInterceptor` skips authorization entirely. |
| `roles` | `string[]` | — | When provided, applies `@RequireRoles(...roles)` — the auth handler validates the user has all listed roles. |
| `skipModelRoles` | `boolean` | `false` | When `true`, sets `SKIP_MODEL_ROLES_KEY` metadata — the `AuthInterceptor` passes `undefined` as the model to `authHandler.authorize()`, so model-level `@roles()` checks are skipped. Route-level roles (if set) still apply. |

If `auth` is omitted, `@Auth(Model)` is applied by default (requires authentication + model-level role checks).

#### `ObserverEventsOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `enableObserverEvents` | `boolean` | `false` | Enables SSE stream events globally. |
| `observerFlavours` | `any[]` | all registered | List of adapter flavours that will emit stream events. |
| `observerApiPath` | `string` | `"/events"` | SSE endpoint path. |

---

## Auth Configuration

### `DecafAuthModule.forRoot(options)`

Optional standalone module for registering auth wiring independently of `DecafCoreModule`.

```ts
import { DecafAuthModule } from "@decaf-ts/for-nest";

@Module({
  imports: [
    DecafAuthModule.forRoot({
      global: true,
      handler: MyAuthHandler,
    }),
  ],
})
export class AppModule {}
```

> **Note:** `DecafCoreModule` (booted via `DecafModule.forRootAsync`) already registers `DecafRequestHandlerInterceptor` as a global `APP_INTERCEPTOR`. `DecafAuthModule` does **not** duplicate this registration.

#### `DecafAuthModuleOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `global` | `boolean` | `false` | When `true`, registers `AuthInterceptor` as a global `APP_INTERCEPTOR` (via `useExisting`) and marks the module as `@Global()`. When `false`, `AuthInterceptor` is provided but only activated on routes decorated with `@Auth()` or `@RequireRoles()`. |
| `handler` | `Type<AuthHandler>` | — | Concrete auth handler class. Registered both as itself and under the `AUTH_HANDLER` token. |

### Manual Auth Wiring (without `DecafAuthModule`)

For full control, wire auth directly in your module:

```ts
import { AUTH_HANDLER, AuthInterceptor } from "@decaf-ts/for-nest";
import { APP_INTERCEPTOR } from "@nestjs/core";

@Global()
@Module({
  providers: [
    AuthInterceptor,
    AuthService,
    FabricKeycloakAuthHandler,
    { provide: AUTH_HANDLER, useClass: FabricKeycloakAuthHandler },
    { provide: APP_INTERCEPTOR, useExisting: AuthInterceptor },
  ],
  exports: [AUTH_HANDLER, AuthInterceptor, AuthService],
})
export class AuthModule {}
```

---

## Auth Decorators

### `@Auth(model?)`

Applies `ApiBearerAuth()`, `UseInterceptors(AuthInterceptor)`, and (when a model is given) sets `AUTH_META_KEY` metadata so the handler knows which model is being accessed.

```ts
@Auth(Product)
@Controller("product")
export class ProductController {}
```

### `@Public()`

Marks a route or controller as public — `AuthInterceptor` skips authorization.

```ts
@Public()
@Get("health")
health() { return { status: "ok" }; }
```

### `@RequireRoles(...roles)`

Requires the user to have all listed roles. Applies `ApiSecurity("bearer")`, `SetMetadata(REQUIRED_ROLES_KEY, roles)`, and `UseInterceptors(AuthInterceptor)`.

```ts
@RequireRoles("admin", "writer")
@Put("product/:id")
update() {}
```

### `@SkipFabricIdentity()` *(application-specific)*

Application-level decorator (e.g. in ew-backend) that sets metadata to skip Fabric identity re-enrollment for specific routes. Not part of `for-nest`.

---

## Auth Handler

### `AuthHandler<EC, C, D>`

Abstract base class from `@decaf-ts/for-http/server`. Concrete handlers extend it and override:

| Method | Required | Description |
|---|---|---|
| `extractFromAuth(ctx: EC): D \| Promise<D>` | Yes | Pulls auth data (user, roles, organization) from the platform execution context. MUST throw `AuthorizationError` when unauthenticated. |
| `bindToContext(ctx: C, data: D)` | Yes* | Binds auth data to the request context. Default implementation calls `ctx.accumulate(data)`. Override to add adapter-specific keys (e.g. `UUID`, `organization`). |
| `validate(data, routeRoles, model, ...args)` | No | Default validates route roles then model-level roles (from `@roles()`). Override for custom logic. |

\* The default `bindToContext` exists but every concrete handler typically overrides it.

```ts
import { AuthHandler } from "@decaf-ts/for-nest";
import { AuthorizationError } from "@decaf-ts/core";

class CustomAuthHandler extends AuthHandler {
  protected extractFromAuth(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) throw new AuthorizationError("Unauthenticated");
    return { user: "alice", roles: ["admin"] };
  }

  protected bindToContext(ctx: DecafRequestContext, data: AuthData) {
    ctx.accumulate({ UUID: data.user, user: data.user });
  }
}
```

### `AuthData` / `UserData`

| Field | Type | Description |
|---|---|---|
| `user` | `string` | Authenticated user identifier. |
| `roles` | `string[]` | Roles granted to the user. |
| `organization` | `string` | Organization / tenant / MSP. |

---

## Auth Interceptor Flow

```
Request → AuthInterceptor → DecafRequestHandlerInterceptor → Controller
```

1. **`AuthInterceptor`** (request-scoped):
   - Reads `IS_PUBLIC_KEY` — if `true`, skips auth.
   - Reads `AUTH_META_KEY` (model name) and `REQUIRED_ROLES_KEY` (route roles).
   - Reads `SKIP_MODEL_ROLES_KEY` — if `true`, passes `undefined` as model (skips model-level role checks).
   - Calls `authHandler.authorize(ctx, effectiveModel, requiredRoles, requestContext)`.
   - Runs `applyTransformers()` — iterates `Adapter.flavoursToTransform()`, instantiates each `RequestToContextTransformer` if needed, calls `transformer.from(requestContext)`, and accumulates the result.
   - Enriches the logger with `user` / `organization` if present.

2. **`DecafRequestHandlerInterceptor`** (request-scoped, registered by `DecafCoreModule`):
   - Calls `contextualize(req)` — accumulates `headers`, `logger`, `timestamp`, `operation` into the request context.
   - Calls `executor.exec(req, res)` — runs all registered `DecafRequestHandler` instances in sequence.

---

## Webhook Module

### `DecafWebhookModule.forRootAsync(options)`

Standalone module for webhook delivery. Boots its own persistence layer (separate from `DecafModule`).

```ts
import { DecafWebhookModule } from "@decaf-ts/for-nest";

@Module({
  imports: [
    DecafWebhookModule.forRootAsync({
      conf: [[NanoAdapter, couchConfig, new NanoTransformer()]],
      webhookApiPath: "/webhooks",
      handlers: [WebhookAuthHandler],
    }),
  ],
})
export class AppModule {}
```

#### `DecafWebhookModuleOptions`

| Option | Type | Required | Default | Description |
|---|---|---|---|---|
| `conf` | same as `DecafModuleOptions.conf` | Yes | — | Adapter tuples for webhook persistence. |
| `handlers` | `Type<DecafRequestHandler>[]` | No | `[]` | Request handlers for the webhook pipeline. |
| `initialization` | `() => Promise<void>` | No | — | Called after webhook persistence boots. |
| `webhookApiPath` | `string` | No | `"/webhooks"` | Router prefix for webhook controllers. |

---

## Migration execution

`DecafCoreModule.migrate` wraps `MigrationService.migrateAdapters` once the persistence layer is ready. Use it to orchestrate upgrades across the adapters you boot in `DecafCoreModule.bootPersistence`.

```ts
const migrations = await DecafCoreModule.migrate({
  flavours: ["nano", "type-orm"],
  taskMode: true,
  taskService,
});

for (const migration of migrations) {
  await migration.track();
}
```

Passing `taskMode: true` causes each semver bump to become a tracked `CompositeTask`. Boot a dedicated `RamAdapter` and `TaskService` (never share the task engine alias with migrating adapters) before calling `migrate`, and make sure your version handlers (`retrieveLastVersion` / `setCurrentVersion`) live inside the module that owns the adapter.

From the CLI, the same flow is exposed as `npx decaf nest migrate`. Example:

```bash
npx decaf nest migrate \
  --input ./dist/app.module.js \
  --flavour nano,type-orm \
  --to 1.2.0 \
  --task-mode \
  --dry-run=false
```

`DecafCoreModule.migrate` consults the migration handlers you registered per flavour (`retrieveLastVersion`/`setCurrentVersion`) so it always knows the current persisted head before building the execution plan. When `taskMode` is enabled each version is enqueued as a tracked `CompositeTask`; immediately after each task resolves `MigrationService.track()` calls `setCurrentVersion` for that version so the stored `currentVersion` equals the last fully applied hop. Failed tasks leave the version untouched, allowing `MigrationService.retry(taskId)` (optionally observed via `taskService.track(id)`) to reset the `TaskModel` to `PENDING`, clear its error/lease metadata, and replay only the incomplete version before proceeding.

In inline (non-task) mode the version marker updates only once after the entire batch completes, whereas task mode updates after each version so the next run always resumes at the correct semantic boundary even if an earlier version already succeeded. Specify `toVersion` (CLI `--to`) to define your goal; `MigrationService` filters migrations to those whose normalized versions fall strictly between the persisted `currentVersion` and the requested target so every run progressively walks the system through its lifecycle.

Control precedence through the `@migration` decorator:

- `reference`: the canonical label (typically semver) used in logs and dependency hints.
- `precedence`: point to another migration (constructor, token, or object) to force ordering between migrations with identical version/flavour.
- `flavour`: restricts the migration to a given adapter flavour (`"nano"`, `"type-orm"`, `"hlf-fabric"`, ...).
- `rules`: async predicates `(qr, adapter, ctx)` that gate execution; if a rule returns `false` the migration is skipped without failing the run.

Keep your TaskEngine on a `RamAdapter` alias that never overlaps the adapters being migrated so lease metadata stays isolated, and let `MigrationService` track each version to ensure `currentVersion` only advances after a migration succeeds.

The CLI boots the Nest context without opening HTTP ports, creates a `RamAdapter` task engine (`decaf-cli-task-engine`), attaches the logger to every queued migration tracker, and waits on `migration.track()` before shutting down the task service, adapter, and Nest app. CLI flags always win over `decaf.migration` entries inside `package.json`. `--dry-run` remains a compatibility flag and no longer skips persistence.

Refer to the [CLI module](../cli/workdocs/5-HowToUse.md) for how to boot the command runner; this migration command is implemented inside `for-nest` and reuses the `DecafCoreModule.migrate` wiring described above.

## Coding Principles

- group similar functionality in folders (analog to namespaces but without any namespace declaration)
- one class per file;
- one interface per file (unless interface is just used as a type);
- group types as other interfaces in a types.ts file per folder;
- group constants or enums in a constants.ts file per folder;
- group decorators in a decorators.ts file per folder;
- always import from the specific file, never from a folder or index file (exceptions for dependencies on other packages);
- prefer the usage of established design patters where applicable:
  - Singleton (can be an anti-pattern. use with care);
  - factory;
  - observer;
  - strategy;
  - builder;
  - etc;

## Release Documentation Hooks
Stay aligned with the automated release pipeline by reviewing [Release Notes](./workdocs/reports/RELEASE_NOTES.md) and [Dependencies](./workdocs/reports/DEPENDENCIES.md) after trying these recipes (updated on 2025-11-26).
