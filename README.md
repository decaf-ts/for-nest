![Banner](./workdocs/assets/decaf-logo.svg)
## Typescript Template

This repository is meant to provide an enterprise template for any standard Typescript project

> Release docs refreshed on 2025-11-26. See [workdocs/reports/RELEASE_NOTES.md](./workdocs/reports/RELEASE_NOTES.md) for ticket summaries.

![Licence](https://img.shields.io/github/license/decaf-ts/for-nest.svg?style=plastic)
![GitHub language count](https://img.shields.io/github/languages/count/decaf-ts/for-nest?style=plastic)
![GitHub top language](https://img.shields.io/github/languages/top/decaf-ts/for-nest?style=plastic)

[![Build & Test](https://github.com/decaf-ts/for-nest/actions/workflows/nodejs-build-prod.yaml/badge.svg)](https://github.com/decaf-ts/for-nest/actions/workflows/nodejs-build-prod.yaml)
[![CodeQL](https://github.com/decaf-ts/for-nest/actions/workflows/codeql-analysis.yml/badge.svg)](https://github.com/decaf-ts/for-nest/actions/workflows/codeql-analysis.yml)[![Snyk Analysis](https://github.com/decaf-ts/for-nest/actions/workflows/snyk-analysis.yaml/badge.svg)](https://github.com/decaf-ts/for-nest/actions/workflows/snyk-analysis.yaml)
[![Pages builder](https://github.com/decaf-ts/for-nest/actions/workflows/pages.yaml/badge.svg)](https://github.com/decaf-ts/for-nest/actions/workflows/pages.yaml)
[![.github/workflows/release-on-tag.yaml](https://github.com/decaf-ts/for-nest/actions/workflows/release-on-tag.yaml/badge.svg?event=release)](https://github.com/decaf-ts/for-nest/actions/workflows/release-on-tag.yaml)

![Open Issues](https://img.shields.io/github/issues/decaf-ts/for-nest.svg)
![Closed Issues](https://img.shields.io/github/issues-closed/decaf-ts/for-nest.svg)
![Pull Requests](https://img.shields.io/github/issues-pr-closed/decaf-ts/for-nest.svg)
![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)

![Forks](https://img.shields.io/github/forks/decaf-ts/for-nest.svg)
![Stars](https://img.shields.io/github/stars/decaf-ts/for-nest.svg)
![Watchers](https://img.shields.io/github/watchers/decaf-ts/for-nest.svg)

![Node Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=Node&query=$.engines.node&colorB=blue)
![NPM Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fraw.githubusercontent.com%2Fbadges%2Fshields%2Fmaster%2Fpackage.json&label=NPM&query=$.engines.npm&colorB=purple)

Documentation available [here](https://decaf-ts.github.io/for-nest/)

Minimal size: 13.6 KB kb gzipped


### Description

No one needs the hassle of setting up new repos every time.

Now you can create new repositories from this template and enjoy having everything set up for you.



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


### Related

[![Readme Card](https://github-readme-stats.vercel.app/api/pin/?username=decaf-ts&repo=ts-workspace)](https://github.com/decaf-ts/ts-workspace)

### Social

[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/decaf-ts/)




#### Languages

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![ShellScript](https://img.shields.io/badge/Shell_Script-121011?style=for-the-badge&logo=gnu-bash&logoColor=white)

## Getting help

If you have bug reports, questions or suggestions please [create a new issue](https://github.com/decaf-ts/ts-workspace/issues/new/choose).

## Contributing

I am grateful for any contributions made to this project. Please read [this](./workdocs/98-Contributing.md) to get started.

## Supporting

The first and easiest way you can support it is by [Contributing](./workdocs/98-Contributing.md). Even just finding a typo in the documentation is important.

Financial support is always welcome and helps keep both me and the project alive and healthy.

So if you can, if this project in any way. either by learning something or simply by helping you save precious time, please consider donating.

## License

This project is released under the [MIT License](./LICENSE.md).

By developers, for developers...
