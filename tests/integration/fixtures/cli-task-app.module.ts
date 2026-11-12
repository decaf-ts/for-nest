import {
  Injectable,
  Module,
  OnApplicationShutdown,
  OnModuleInit,
} from "@nestjs/common";
import {
  service,
  Service,
  task,
  TaskContext,
  TaskHandler,
  TaskModel,
  TaskService,
} from "@decaf-ts/core";
import { RamAdapter } from "@decaf-ts/core/ram";

RamAdapter.decoration();

export const CLI_TASK_ADAPTER_ALIAS = "_cli_task_engine";

const adapter = new RamAdapter({} as any, CLI_TASK_ADAPTER_ALIAS);

@task("cli-echo")
export class CliEchoHandler extends TaskHandler<any, any> {
  async run(input: any, ctx: TaskContext) {
    ctx.logger.info(`echo ${JSON.stringify(input ?? null)}`);
    return input;
  }
}

@task("cli-flaky")
export class CliFlakyHandler extends TaskHandler<any, string> {
  // toggled by the tests to make the step fail or pass
  static failing = false;
  static runs = 0;

  async run(_input: any, ctx: TaskContext) {
    CliFlakyHandler.runs += 1;
    if (CliFlakyHandler.failing) throw new Error("cli-flaky-boom");
    ctx.logger.info("flaky step passed");
    return "flaky-ok";
  }
}

export class CliTaskService extends TaskService<any> {
  override async initialize() {
    return super.initialize({
      adapter,
      workerId: "cli-task-fixture",
      pollMsIdle: 50,
      pollMsBusy: 25,
      leaseMs: 5000,
      autoShutdown: { enabled: false },
    } as any);
  }
}
service(TaskModel)(CliTaskService);

export function cliTaskService(): TaskService<any> {
  return Service.get<TaskService<any>, TaskModel>(TaskModel);
}

function isBooted(): boolean {
  try {
    return !!cliTaskService().client;
  } catch {
    return false;
  }
}

// mirrors a real app: its boot initializes the services and starts the task engine,
// and closing it shuts the services down (as DecafCoreModule does).
// the tests run several CLI commands in one process, so later boots reuse the service
@Injectable()
class CliTaskBootstrap implements OnModuleInit, OnApplicationShutdown {
  async onModuleInit() {
    if (!isBooted()) await Service.boot();
    const engine = cliTaskService().client;
    if (!(await engine.isRunning())) await engine.start();
  }

  async onApplicationShutdown() {
    await Service.shutdown();
  }
}

@Module({ providers: [CliTaskBootstrap] })
export class CliTaskAppModule {}
