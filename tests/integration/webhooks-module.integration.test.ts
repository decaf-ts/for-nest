import {
  WebhookDelivery,
  WebhookEventRecord,
  WebhookStatus,
  WebhookSubscription,
} from "@decaf-ts/for-http/hooks";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  Adapter,
  Context,
  column,
  createdAt,
  pk,
  table,
  updatedAt,
  uuid,
} from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import {
  Model,
  ModelArg,
  model,
  required,
} from "@decaf-ts/decorator-validation";
import { DecorationKeys, Metadata, uses } from "@decaf-ts/decoration";
import { AxiosHttpAdapter } from "@decaf-ts/for-http";
import { hook } from "@decaf-ts/for-http/hooks";
import { NanoAdapter, NanoFlavour } from "@decaf-ts/for-nano";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { DecafExceptionFilter, DecafModule } from "../../src";
import { DecafWebhookModule } from "../../src/webhooks";
import {
  WebhookDeliveryMode,
  WebhookDeliveryService,
} from "@decaf-ts/for-http/hooks";
import { RequestToContextTransformer } from "@decaf-ts/for-http/server";
import * as http from "http";
import { InternalError } from "@decaf-ts/db-decorators";

NanoAdapter.decoration();
RamAdapter.decoration();
Metadata.set(DecorationKeys.FLAVOUR, RamFlavour, []);
Metadata.set(DecorationKeys.FLAVOUR, NanoFlavour, []);

uses(NanoFlavour)(WebhookSubscription);
uses(NanoFlavour)(WebhookEventRecord);
uses(NanoFlavour)(WebhookDelivery);

Model.setBuilder(Model.fromModel);

jest.setTimeout(180000);

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs = 15000,
  intervalMs = 150
) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new InternalError(`Timed out after ${timeoutMs}ms waiting for condition`);
}

function makeContext(operation: OperationKeys = OperationKeys.READ) {
  return Context.factory({
    operation,
    headers: {},
    overrides: {},
  } as any);
}

async function createNanoTestResources() {
  const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
  const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
  const dbHost = process.env.NANO_HOST || "localhost:10010";
  const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";

  const suffix = randomSuffix();
  const dbName = `webhooks_module_${suffix}`;
  const user = `webhooks_user_${suffix}`;
  const password = `${user}_pw`;
  const connection = NanoAdapter.connect(
    adminUser,
    adminPassword,
    dbHost,
    dbProtocol
  );

  await NanoAdapter.createDatabase(connection, dbName).catch((e: any) => {
    if (!(e instanceof Error) || (e as any).error !== "file_exists") {
      throw new InternalError(String(e));
    }
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (!(e instanceof Error) || (e as any).error !== "file_exists") {
        throw new InternalError(String(e));
      }
    }
  );

  return {
    connection,
    dbName,
    user,
    password,
    host: dbHost,
    protocol: dbProtocol,
  };
}

async function cleanupNanoTestResources(resources: any) {
  const { connection, dbName, user } = resources;
  try {
    await NanoAdapter.deleteDatabase(connection, dbName);
  } catch (e: any) {
    if (!(e instanceof Error)) throw new InternalError(String(e));
  }
  try {
    await NanoAdapter.deleteUser(connection, dbName, user);
  } catch (e: any) {
    if (!(e instanceof Error)) throw new InternalError(String(e));
  } finally {
    NanoAdapter.closeConnection(connection);
  }
}

class NanoWebhookTransformer extends RequestToContextTransformer<any> {
  async from(req: any): Promise<any> {
    return {
      headers: req?.headers || {},
      overrides: {},
    };
  }
}

class WebhookRamTransformer extends RequestToContextTransformer<any> {
  async from(req: any): Promise<any> {
    return {
      headers: req?.headers || {},
      overrides: {
        observeFullResult: true,
      },
    };
  }
}

@hook()
@uses(RamFlavour)
@table("webhook_products")
@model()
class WebhookProduct extends Model<boolean> {
  @pk()
  @uuid()
  id!: string;

  @column()
  @required()
  classification!: string;

  @column()
  @createdAt()
  createdAt!: Date;

  @column()
  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<WebhookProduct>) {
    super(arg);
  }
}

describe("Standalone webhook module live integration", () => {
  let app: INestApplication;
  let nanoResources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let appServer: http.Server;
  let receiverServer: http.Server;
  let receiverUrl: string;
  let appHttp: AxiosHttpAdapter;
  let deliveryService: WebhookDeliveryService<AxiosHttpAdapter>;

  const receivedRequests: Array<{
    body: any;
    headers: Record<string, any>;
    url: string;
  }> = [];

  beforeAll(async () => {
    nanoResources = await createNanoTestResources();

    receiverServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        receivedRequests.push({
          url: req.url || "/",
          headers: req.headers as Record<string, any>,
          body: body ? JSON.parse(body) : undefined,
        });

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => receiverServer.listen(0, resolve));
    const receiverAddress = receiverServer.address();
    if (!receiverAddress || typeof receiverAddress === "string") {
      throw new InternalError("Failed to bind receiver server");
    }
    receiverUrl = `http://127.0.0.1:${receiverAddress.port}`;

    const moduleRef = await Test.createTestingModule({
      imports: [
        await DecafModule.forRootAsync({
          conf: [
            [RamAdapter, { UUID: "webhook-user" }, new WebhookRamTransformer()],
          ],
          autoControllers: true,
          autoServices: true,
          observerOptions: {
            enableObserverEvents: true,
            observerFlavours: [RamFlavour],
          },
        }),
        await DecafWebhookModule.forRootAsync({
          conf: [
            [
              NanoAdapter,
              {
                couchUser: nanoResources.user,
                couchPassword: nanoResources.password,
                host: nanoResources.host,
                dbName: nanoResources.dbName,
                protocol: nanoResources.protocol,
              },
              nanoResources.dbName,
              new NanoWebhookTransformer(),
            ],
          ],
          webhookApiPath: "webhooks",
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.init();
    appServer = await app.listen(0);

    const appAddress = appServer.address();
    if (!appAddress || typeof appAddress === "string") {
      throw new InternalError("Failed to bind application server");
    }
    appHttp = new AxiosHttpAdapter(
      {
        protocol: "http",
        host: `127.0.0.1:${appAddress.port}`,
      },
      "webhooks-app-client"
    );
    appHttp.client.interceptors.request.use((config) => {
      config.headers = {
        ...(config.headers || {}),
        Authorization: "Bearer webhook-user",
      };
      return config;
    });

    const webhookAdapter = Adapter.get(NanoFlavour) as NanoAdapter;
    if (!webhookAdapter) {
      throw new InternalError("Webhook adapter was not registered");
    }

    deliveryService = new WebhookDeliveryService<AxiosHttpAdapter>();
    await deliveryService.boot({
      adapter: webhookAdapter,
      httpAdapter: new AxiosHttpAdapter(
        {
          protocol: "http",
          host: `127.0.0.1:${receiverAddress.port}`,
        },
        "webhooks-receiver"
      ),
      mode: WebhookDeliveryMode.POLLING,
      autoStart: false,
      models: [WebhookProduct],
      flavours: [RamFlavour],
      batchSize: 10,
      pollIntervalMs: 100,
      allowWildcard: true,
      callback: async (adapter) => {
        await adapter["index"](
          WebhookEventRecord,
          WebhookSubscription as any,
          WebhookDelivery as any
        );
      },
    });

    await deliveryService.startObserving(makeContext());
  });

  afterAll(async () => {
    try {
      await deliveryService?.stop();
    } catch {
      // ignore shutdown noise from nested persistence shutdown
    }
    await app?.close();
    receiverServer?.close();
    await cleanupNanoTestResources(nanoResources);
  });

  beforeEach(() => {
    receivedRequests.length = 0;
  });

  async function processBatchUntilReceived(
    expectedCount: number,
    timeoutMs = 12000
  ) {
    await waitFor(async () => {
      await deliveryService.processBatch(10, makeContext());
      return receivedRequests.length >= expectedCount;
    }, timeoutMs);
    expect(receivedRequests.length).toBe(expectedCount);
  }

  async function requestJson(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: any
  ) {
    switch (method) {
      case "GET":
        return appHttp.client.get(path);
      case "POST":
        return appHttp.client.post(
          path,
          typeof body === "string" ? body : JSON.stringify(body),
          { headers: { "content-type": "application/json" } }
        );
      case "PUT":
        return appHttp.client.put(
          path,
          typeof body === "string" ? body : JSON.stringify(body),
          { headers: { "content-type": "application/json" } }
        );
      case "DELETE":
        return appHttp.client.delete(path);
    }
  }

  function unwrap<T>(response: any): T {
    const payload = response?.data?.data ?? response?.data;
    if (typeof payload === "string") {
      try {
        return JSON.parse(payload) as T;
      } catch {
        return payload as T;
      }
    }
    return payload as T;
  }

  it("exposes webhook CRUD and action endpoints independently from the main module", async () => {
    const subscription = {
      topic: "*.*",
      url: `${receiverUrl}/hooks/product`,
      secret: "webhook-secret",
      active: true,
    };

    const createdSubscriptionResponse = await requestJson(
      "POST",
      "/webhooks/webhook-subscriptions",
      subscription
    );
    const createdSubscription = unwrap<any>(createdSubscriptionResponse);

    expect(createdSubscriptionResponse.status).toBe(201);
    expect(createdSubscription.id).toBeDefined();
    expect(createdSubscription.topic).toBe("*.*");

    const readSubscriptionResponse = await requestJson(
      "GET",
      `/webhooks/webhook-subscriptions/${createdSubscription.id}`
    );
    const readSubscription = unwrap<any>(readSubscriptionResponse);
    expect(readSubscriptionResponse.status).toBe(200);
    expect(readSubscription.active).toBe(true);

    const visibleSubscription =
      await deliveryService.publications.subscriptions.read(
        createdSubscription.id,
        makeContext()
      );
    expect(visibleSubscription.id).toBe(createdSubscription.id);

    await waitFor(async () => {
      const activeSubscriptions =
        await deliveryService.publications.subscriptions
          .select()
          .where(
            deliveryService.publications.subscriptions.attr("active").eq(true)
          )
          .execute(makeContext());
      return activeSubscriptions.some(
        (subscription) => subscription.id === createdSubscription.id
      );
    }, 12000);

    const createdProductResponse = await requestJson(
      "POST",
      "/webhook-products",
      {
        classification: "webhook-live-test",
      }
    );
    expect(createdProductResponse.status).toBe(201);
    const createdProduct = unwrap<any>(createdProductResponse);

    await waitFor(async () => {
      const events = await deliveryService.events
        .select()
        .execute(makeContext());
      return events.some(
        (event) =>
          event.entityId === createdProduct.id && event.deliveriesTotal > 0
      );
    }, 12000);

    const eventList = await deliveryService.events
      .select()
      .execute(makeContext());
    const event = eventList.find(
      (entry) =>
        entry.entityId === createdProduct.id && entry.deliveriesTotal > 0
    );
    expect(event).toBeDefined();
    await processBatchUntilReceived(1);

    expect(receivedRequests[0].url).toBe("/hooks/product");
    expect(receivedRequests[0].headers["x-webhook-topic"]).toBe(
      "webhookproduct.created"
    );
    expect(receivedRequests[0].headers["x-webhook-signature"]).toBeDefined();
    expect(receivedRequests[0].body?.payload?.classification).toBe(
      "webhook-live-test"
    );

    await waitFor(async () => {
      const state = await deliveryService.events.read(event!.id, makeContext());
      return state.status === WebhookStatus.COMPLETED;
    }, 12000);

    const firstEventState = await deliveryService.events.read(
      event!.id,
      makeContext()
    );
    expect(firstEventState.status).toBe(WebhookStatus.COMPLETED);

    const deactivatedResponse = await requestJson(
      "POST",
      `/webhooks/webhook-subscriptions/${createdSubscription.id}/deactivate`
    );
    const deactivated = unwrap<any>(deactivatedResponse);
    expect([200, 201]).toContain(deactivatedResponse.status);
    expect(deactivated.active).toBe(false);
    await waitFor(async () => {
      const activeSubscriptions =
        await deliveryService.publications.subscriptions
          .select()
          .where(
            deliveryService.publications.subscriptions.attr("active").eq(true)
          )
          .execute(makeContext());
      return !activeSubscriptions.some(
        (subscription) => subscription.id === createdSubscription.id
      );
    }, 12000);

    const secondProductResponse = await requestJson(
      "POST",
      "/webhook-products",
      {
        classification: "webhook-live-test-deactivated",
      }
    );
    expect(secondProductResponse.status).toBe(201);
    await deliveryService.processBatch(10, makeContext());
    expect(receivedRequests.length).toBe(1);

    const reactivatedResponse = await requestJson(
      "POST",
      `/webhooks/webhook-subscriptions/${createdSubscription.id}/reactivate`
    );
    const reactivated = unwrap<any>(reactivatedResponse);
    expect([200, 201]).toContain(reactivatedResponse.status);
    expect(reactivated.active).toBe(true);
    await waitFor(async () => {
      const activeSubscriptions =
        await deliveryService.publications.subscriptions
          .select()
          .where(
            deliveryService.publications.subscriptions.attr("active").eq(true)
          )
          .execute(makeContext());
      return activeSubscriptions.some(
        (subscription) => subscription.id === createdSubscription.id
      );
    }, 12000);

    const updatedProductResponse = await requestJson(
      "PUT",
      `/webhook-products/${createdProduct.id}`,
      {
        classification: "webhook-live-test-updated",
      }
    );
    expect(updatedProductResponse.status).toBe(200);
    const updatedProduct = unwrap<any>(updatedProductResponse);
    await waitFor(async () => {
      const events = await deliveryService.events
        .select()
        .execute(makeContext());
      return events.some(
        (entry) =>
          entry.entityId === updatedProduct.id && entry.deliveriesTotal > 0
      );
    }, 12000);
    const updatedEventList = await deliveryService.events
      .select()
      .execute(makeContext());
    const updatedEvent = updatedEventList.find(
      (entry) =>
        entry.entityId === updatedProduct.id && entry.deliveriesTotal > 0
    );
    expect(updatedEvent).toBeDefined();
    await waitFor(async () => {
      const deliveries = await deliveryService.deliveries.findBy(
        "eventId",
        updatedEvent!.id,
        makeContext()
      );
      return deliveries.length > 0;
    }, 12000);
    const updatedDeliveries = await deliveryService.deliveries.findBy(
      "eventId",
      updatedEvent!.id,
      makeContext()
    );
    expect(updatedDeliveries.length).toBeGreaterThan(0);
    await processBatchUntilReceived(2);

    const createdForDeleteResponse = await requestJson(
      "POST",
      "/webhook-products",
      {
        classification: "webhook-live-test-to-delete",
      }
    );
    expect(createdForDeleteResponse.status).toBe(201);
    const createdForDelete = unwrap<any>(createdForDeleteResponse);
    await waitFor(async () => {
      const events = await deliveryService.events
        .select()
        .execute(makeContext());
      return events.some(
        (entry) =>
          entry.entityId === createdForDelete.id && entry.deliveriesTotal > 0
      );
    }, 12000);
    const createdForDeleteEventList = await deliveryService.events
      .select()
      .execute(makeContext());
    const createdForDeleteEvent = createdForDeleteEventList.find(
      (entry) =>
        entry.entityId === createdForDelete.id && entry.deliveriesTotal > 0
    );
    expect(createdForDeleteEvent).toBeDefined();
    await waitFor(async () => {
      const deliveries = await deliveryService.deliveries.findBy(
        "eventId",
        createdForDeleteEvent!.id,
        makeContext()
      );
      return deliveries.length > 0;
    }, 12000);
    const createdForDeleteDeliveries = await deliveryService.deliveries.findBy(
      "eventId",
      createdForDeleteEvent!.id,
      makeContext()
    );
    expect(createdForDeleteDeliveries.length).toBeGreaterThan(0);
    await processBatchUntilReceived(3);

    const deletedProductResponse = await requestJson(
      "DELETE",
      `/webhook-products/${createdForDelete.id}`
    );
    expect(deletedProductResponse.status).toBe(200);
    await waitFor(async () => {
      const events = await deliveryService.events
        .select()
        .execute(makeContext());
      return events.some(
        (entry) =>
          entry.entityId === createdForDelete.id && entry.deliveriesTotal > 0
      );
    }, 12000);
    const deletedEventList = await deliveryService.events
      .select()
      .execute(makeContext());
    const deletedEvent = deletedEventList.find(
      (entry) =>
        entry.entityId === createdForDelete.id && entry.deliveriesTotal > 0
    );
    expect(deletedEvent).toBeDefined();
    await waitFor(async () => {
      const deliveries = await deliveryService.deliveries.findBy(
        "eventId",
        deletedEvent!.id,
        makeContext()
      );
      return deliveries.length > 0;
    }, 12000);
    const deletedDeliveries = await deliveryService.deliveries.findBy(
      "eventId",
      deletedEvent!.id,
      makeContext()
    );
    expect(deletedDeliveries.length).toBeGreaterThan(0);
    await processBatchUntilReceived(4);

    const replayResponse = await requestJson(
      "POST",
      `/webhooks/webhook-events/${event!.id}/replay`
    );
    expect([200, 201]).toContain(replayResponse.status);
    const replayDeliveries = await deliveryService.deliveries.findBy(
      "eventId",
      event!.id,
      makeContext()
    );
    expect(replayDeliveries.length).toBeGreaterThan(0);
    await processBatchUntilReceived(5);

    const classifications = receivedRequests.map(
      (request) => request.body?.payload?.classification
    );
    expect(classifications).toEqual([
      "webhook-live-test",
      "webhook-live-test-updated",
      "webhook-live-test-to-delete",
      "webhook-live-test-to-delete",
      "webhook-live-test",
    ]);

    expect(
      receivedRequests.map((request) => request.headers["x-webhook-topic"])
    ).toEqual([
      "webhookproduct.created",
      "webhookproduct.updated",
      "webhookproduct.created",
      "webhookproduct.deleted",
      "webhookproduct.created",
    ]);
    for (const request of receivedRequests) {
      expect(request.headers["x-webhook-signature"]).toBeDefined();
    }

    await waitFor(async () => {
      const state = await deliveryService.events.read(event!.id, makeContext());
      return state.status === WebhookStatus.COMPLETED;
    }, 12000);

    const replayedEvent = await deliveryService.events.read(
      event!.id,
      makeContext()
    );

    expect(replayedEvent.status).toBe(WebhookStatus.COMPLETED);
  });
});
