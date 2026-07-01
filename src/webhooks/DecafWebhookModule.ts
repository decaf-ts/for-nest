import { DynamicModule, Module } from "@nestjs/common";
import { RouterModule } from "@nestjs/core";
import { Adapter, PersistenceService } from "@decaf-ts/core";
import { InternalError } from "@decaf-ts/db-decorators";
import { Constructor, uses } from "@decaf-ts/decoration";
import { Logging } from "@decaf-ts/logging";
import { DecafRequestContext } from "../request";
import { DecafHandlerExecutor } from "../request/DecafHandlerExecutor";
import { DecafRequestHandlerInterceptor } from "../interceptors/DecafRequestHandlerInterceptor";
import { DECAF_HANDLERS } from "../constants";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DecafWebhookModuleOptions } from "./types";
import { FromModelController } from "../decaf-model";
import { requestToContextTransformer } from "@decaf-ts/for-http/server";
import {
  WebhookDelivery,
  WebhookEventRecord,
  WebhookSubscription,
} from "@decaf-ts/for-http/hooks";
import {
  WebhookEventActionsController,
  WebhookSubscriptionActionsController,
} from "./controllers";

@Module({})
export class DecafWebhookModule {
  private static _logger = Logging.for(DecafWebhookModule);
  private static _persistence?: PersistenceService<Adapter<any, any, any, any>>;

  private static get log() {
    return this._logger;
  }

  static async bootPersistence(
    options: DecafWebhookModuleOptions
  ): Promise<Adapter<any, any, any, any>[]> {
    const log = this.log.for(this.bootPersistence);
    if (!this._persistence) {
      const trimmed = options.conf.map(([contr, cfg, ...args]) => {
        const possible = args.pop();
        if (!possible) return [contr, cfg];
        return [contr, cfg, ...args];
      });
      this._persistence = new PersistenceService();
      await this._persistence.boot(trimmed);

      const clients = this._persistence.client;
      for (let i = 0; i < clients.length; i++) {
        const cache = (Adapter as any)._cache || ((Adapter as any)._cache = {});
        const webhookKeys = [
          clients[i].flavour,
          clients[i].alias,
          "webhook_deliveries",
          "webhook_events",
          "webhook_subscriptions",
        ].filter((value): value is string => !!value);
        for (const key of webhookKeys) {
          cache[key] = clients[i];
        }

        const c = options.conf[i];
        const possibleTransf = c.slice(2, c.length);
        let transformer = possibleTransf.pop();
        if (!transformer || !(transformer as { from?: unknown }).from) {
          const contr = Adapter.transformerFor(clients[i].flavour);
          if (!contr)
            throw new InternalError(
              `No transformer found for flavour ${clients[i].flavour}.`
            );
          try {
            transformer = (contr as any).from
              ? contr
              : new (contr as Constructor<any>)();
          } catch (e: unknown) {
            throw new InternalError(
              `Failed to boot transformer for ${clients[i].flavour}: ${e}`
            );
          }
        }
        requestToContextTransformer(clients[i].flavour)(transformer);

        uses(clients[i].flavour)(WebhookSubscription);
        uses(clients[i].flavour)(WebhookEventRecord);
        uses(clients[i].flavour)(WebhookDelivery);
      }
      log.info("persistence layer created successfully!");

      if (options.initialization) {
        try {
          await options.initialization();
        } catch (e: unknown) {
          throw new InternalError(`Failed to initialize webhook module: ${e}`);
        }
      }
    }

    return this._persistence.client;
  }

  static async forRoot(
    options: DecafWebhookModuleOptions
  ): Promise<DynamicModule> {
    return this.forRootAsync(options);
  }

  static async forRootAsync(
    options: DecafWebhookModuleOptions
  ): Promise<DynamicModule> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const adapters = await this.bootPersistence(options);
    const controllers = [
      FromModelController.create(WebhookSubscription),
      FromModelController.create(WebhookEventRecord),
      FromModelController.create(WebhookDelivery),
      WebhookSubscriptionActionsController,
      WebhookEventActionsController,
    ];

    return {
      module: DecafWebhookModule,
      controllers,
      imports: [
        RouterModule.register([
          {
            path: (options.webhookApiPath || "webhooks").replace(/^\//, ""),
            module: DecafWebhookModule,
          },
        ]),
      ],
      providers: [
        DecafRequestContext,
        DecafHandlerExecutor,
        {
          provide: DECAF_HANDLERS,
          useFactory: () => options.handlers?.map((H) => new H()) ?? [],
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: DecafRequestHandlerInterceptor,
        },
      ],
      exports: [DecafRequestContext, DecafHandlerExecutor],
    };
  }
}

export const DecafWebhooksModule = DecafWebhookModule;

export async function runWebhooksMigrations(): Promise<void> {}
