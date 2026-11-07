import { Module } from "@nestjs/common";
import { DecafModule } from "@decaf-ts/for-nest";
import { RamTransformer } from "@decaf-ts/for-http/server";
import { NanoAdapter } from "@decaf-ts/for-nano";
import { TypeORMAdapter } from "@decaf-ts/for-typeorm";
import { RamAdapter } from "@decaf-ts/core/ram";
import { TaskService } from "@decaf-ts/core/tasks";
import { service, Service, TaskModel } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";

function expectEnv(name) {
  const value = process.env[name];
  if (!value) throw new InternalError(`Environment variable ${name} is required`);
  return value;
}

function resolveNanoConfig() {
  return {
    couchUser: expectEnv("NEST_CLI_NANO_USER"),
    couchPassword: expectEnv("NEST_CLI_NANO_PASSWORD"),
    host: process.env.NEST_CLI_NANO_HOST || "localhost:10010",
    protocol: process.env.NEST_CLI_NANO_PROTOCOL === "https" ? "https" : "http",
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
        const ts = Service.get(TaskModel);
        if (ts?.client && typeof ts.client.start === "function") {
          await ts.client.start();
        }
      },
    }),
  ],
})(AppModule);

export default AppModule;
