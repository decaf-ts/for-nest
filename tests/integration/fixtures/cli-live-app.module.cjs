const { Module } = require("@nestjs/common");
const { DecafModule } = require("../../../lib/module.cjs");
const { RamTransformer } = require("../../../lib/ram/index.cjs");
const { NanoAdapter } = require("@decaf-ts/for-nano");
const { TypeORMAdapter } = require("@decaf-ts/for-typeorm");
require("./migrations-stub");

function expectEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is required`);
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
    synchronize: "migration",
    logging: false,
  };
}

class AppModule {}

Module({
  imports: [
    DecafModule.forRootAsync({
      conf: [
        [
          NanoAdapter,
          resolveNanoConfig(),
          "nest-cli-live-nano",
          new RamTransformer(),
        ],
        [
          TypeORMAdapter,
          resolveTypeormConfig(),
          "nest-cli-live-typeorm",
          new RamTransformer(),
        ],
      ],
      autoControllers: false,
      autoServices: false,
    }),
  ],
})(AppModule);

module.exports = {
  AppModule,
};
