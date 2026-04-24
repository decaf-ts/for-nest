import { INestApplication, Module } from "@nestjs/common";
import { Repo, Repository } from "@decaf-ts/core";
import { ProcessStep } from "./fakes/models/ProcessStep";
import { NestFactory } from "@nestjs/core";
import { DecafExceptionFilter, DecafModule } from "../../src";
// @ts-expect-error paths
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { DecafStreamModule } from "../../src/events-module";
import { RamTransformer } from "../../src/ram";
import { EventSource } from "eventsource";

@Module({
  imports: [
    DecafModule.forRootAsync({
      conf: [[RamAdapter, {}, new RamTransformer()]],
      autoControllers: true,
      autoServices: false,
    } as any),
    DecafStreamModule.forFlavours([RamFlavour], "/events"),
  ],
})
class AppModule {}

type EventData = [string, string, string, string];

function waitForClients(url: string, count: number): Promise<EventSource[]> {
  return Promise.all(
    Array.from({ length: count }).map(
      () =>
        new Promise<EventSource>((resolve, reject) => {
          const es = new EventSource(url);
          const timeout = setTimeout(() => {
            es.close();
            reject(new Error("timeout opening eventsource"));
          }, 15000);

          es.onopen = () => {
            clearTimeout(timeout);
            resolve(es);
          };

          es.onerror = (e) => {
            clearTimeout(timeout);
            es.close();
            reject(e as any);
          };
        })
    )
  );
}

function collectMessages(
  es: EventSource,
  expected: number,
  timeoutMs = 20000
): Promise<EventData[]> {
  return new Promise((resolve, reject) => {
    const out: EventData[] = [];

    const timeout = setTimeout(() => {
      es.close();
      reject(new Error(`timeout waiting for ${expected} messages, got ${out.length}`));
    }, timeoutMs);

    es.onmessage = (event) => {
      const parsed = JSON.parse(event.data) as EventData;
      out.push(parsed);
      if (out.length === expected) {
        clearTimeout(timeout);
        es.close();
        resolve(out);
      }
    };

    es.onerror = (e) => {
      clearTimeout(timeout);
      es.close();
      reject(e as any);
    };
  });
}

jest.setTimeout(120000);

describe("SSE concurrency regression", () => {
  let app: INestApplication;
  let repo: Repo<ProcessStep>;
  let serverUrl: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule);
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.init();

    const server = await app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No address");
    serverUrl = `http://127.0.0.1:${address.port}`;

    repo = Repository.forModel(ProcessStep);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("delivers each emitted event once and in order to all connected clients", async () => {
    const clientCount = 24;
    const eventCount = 10;
    const eventIds = Array.from({ length: eventCount }).map((_, idx) => `SSE_REG_${idx}_${Math.random().toString(36).slice(2)}`);

    const clients = await waitForClients(`${serverUrl}/events`, clientCount);

    const collectors = clients.map((es) => collectMessages(es, eventCount));

    for (const id of eventIds) {
      await repo.create(
        new ProcessStep({
          id,
          currentStep: 1,
          totalSteps: 1,
          label: id,
        })
      );
    }

    const allResults = await Promise.all(collectors);

    for (const messages of allResults) {
      expect(messages).toHaveLength(eventCount);

      const receivedIds = messages.map((msg) => msg[2]);
      expect(receivedIds).toEqual(eventIds);

      const uniqueIds = new Set(receivedIds);
      expect(uniqueIds.size).toBe(eventCount);
    }
  });

  it("keeps broadcasting to remaining clients when one client disconnects", async () => {
    const eventCount = 8;
    const eventIds = Array.from({ length: eventCount }).map(
      (_, idx) => `SSE_DISCONNECT_${idx}_${Math.random().toString(36).slice(2)}`
    );

    const clients = await waitForClients(`${serverUrl}/events`, 3);
    const [disconnectingClient, ...remainingClients] = clients;

    const firstEventBeforeDisconnect = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        disconnectingClient.close();
        reject(new Error("disconnecting client did not receive first event"));
      }, 20000);

      disconnectingClient.onmessage = () => {
        clearTimeout(timeout);
        disconnectingClient.close();
        resolve();
      };

      disconnectingClient.onerror = (e) => {
        clearTimeout(timeout);
        disconnectingClient.close();
        reject(e as any);
      };
    });

    const collectors = remainingClients.map((client) =>
      collectMessages(client, eventCount)
    );

    await repo.create(
      new ProcessStep({
        id: eventIds[0],
        currentStep: 1,
        totalSteps: 1,
        label: eventIds[0],
      })
    );

    await firstEventBeforeDisconnect;

    for (const id of eventIds.slice(1)) {
      await repo.create(
        new ProcessStep({
          id,
          currentStep: 1,
          totalSteps: 1,
          label: id,
        })
      );
    }

    const remainingResults = await Promise.all(collectors);
    for (const messages of remainingResults) {
      expect(messages).toHaveLength(eventCount);
      expect(messages.map((msg) => msg[2])).toEqual(eventIds);
      expect(new Set(messages.map((msg) => msg[2])).size).toBe(eventCount);
    }
  });
});
