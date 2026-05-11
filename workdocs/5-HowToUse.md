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


-## Migration execution

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
