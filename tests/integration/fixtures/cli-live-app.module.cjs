const { Module } = require("@nestjs/common");
const { DecafModule } = require("@decaf-ts/for-nest");
const { RamTransformer } = require("@decaf-ts/for-http/server");
const { NanoAdapter } = require("@decaf-ts/for-nano");
const { TypeORMAdapter } = require("@decaf-ts/for-typeorm");
const { RamAdapter } = require("@decaf-ts/core/ram");
const { TaskService } = require("@decaf-ts/core/tasks");
const { service, Service, TaskModel } = require("@decaf-ts/core");
const { InternalError } = require("@decaf-ts/db-decorators");

function expectEnv(name) {
  const value = process.env[name];
  if (!value) throw new InternalError(`Environment variable ${name} is required`);
  return value;
}

function resolveNanoConfig() {
  return {
    user: expectEnv("NEST_CLI_NANO_USER"),
    password: expectEnv("NEST_CLI_NANO_PASSWORD"),
    host: process.env.NEST_CLI_NANO_HOST || "localhost:10010",
    protocol:
      process.env.NEST_CLI_NANO_PROTOCOL === "https" ? "https" : "http",
    dbName: expectEnv("NEST_CLI_NANO_DB"),
  };
}

function resolveTypeormConfig() {
  return {
    type: "postgres",
    host: process.env.NEST_CLI_TYPEORM_HOST || "localhost",
    port: Number(process.env.NEST_CLI_TYPEORM_PORT || "5432"),
    username: expectEnv("NEST_CLI_TYPEORM_USER"),
    password: expectEnv("NEST_CLI_TYPEORM_PASSWORD"),
    database: expectEnv("NEST_CLI_TYPEORM_DB"),
    synchronize: false,
    logging: false,
  };
}

// Self-configuring TaskService: reads no external config, boots its own RamAdapter.
// Registered as @service(TaskModel) so Service.get(TaskModel) finds it after Service.boot().
class FixtureTaskService extends TaskService {
  async initialize() {
    const adapter = new RamAdapter({}, "_fixture_task_engine");
    await adapter.initialize();
    return super.initialize({
      adapter,
      pollMsIdle: 50,
      pollMsBusy: 50,
      autoShutdown: { enabled: false },
    });
  }
}
// Apply @service(TaskModel) programmatically (CJS — no decorator syntax)
service(TaskModel)(FixtureTaskService);

class AppModule {}

Module({
  imports: [
    DecafModule.forRootAsync({
      conf: [
        [NanoAdapter, resolveNanoConfig(), new RamTransformer()],
        [TypeORMAdapter, resolveTypeormConfig(), new RamTransformer()],
      ],
      autoControllers: false,
      autoServices: false,
      initialization: async () => {
        await Service.boot();
        // Start the task engine so it can process migration tasks
        const ts = Service.get(TaskModel);
        if (ts && ts.client && typeof ts.client.start === "function") {
          await ts.client.start();
        }
      },
    }),
  ],
})(AppModule);

module.exports = AppModule;
