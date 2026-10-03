import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Repository } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { InternalError } from "@decaf-ts/db-decorators";
// @ts-expect-error paths
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { DecafModule, DecafExceptionFilter, DecafAuthModule } from "../../src";
import { DecafAuthHandler } from "../../src/auth";
import { RamTransformer } from "@decaf-ts/for-http/server";
import { EventSource } from "eventsource";
import { fingerprintLabel } from "../../src/events-module/utils";
import { ProcessStep } from "./fakes/models/ProcessStep";

jest.setTimeout(120000);

type BuildOptions = {
  subscriptionMode?: boolean;
  requireAuthenticated?: boolean;
  auth?: boolean;
};

async function buildApp(opts: BuildOptions): Promise<{
  app: INestApplication;
  serverUrl: string;
}> {
  const observerOptions: Record<string, unknown> = {
    enableObserverEvents: true,
    subscriptionMode: opts.subscriptionMode ?? false,
  };
  if (opts.requireAuthenticated !== undefined) {
    observerOptions.requireAuthenticated = opts.requireAuthenticated;
  }

  const imports: any[] = [
    await DecafModule.forRootAsync({
      conf: [[RamAdapter, {}, new RamTransformer()]],
      autoControllers: true,
      autoServices: false,
      observerOptions,
    } as any),
  ];

  if (opts.auth) {
    imports.push(
      DecafAuthModule.forRoot({ handler: DecafAuthHandler, global: true })
    );
  }

  const moduleRef = await Test.createTestingModule({ imports }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new DecafExceptionFilter());
  await app.init();
  const server = await app.listen(0, "127.0.0.1");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new InternalError("Failed to resolve server address");
  }
  return { app, serverUrl: `http://127.0.0.1:${address.port}` };
}

function listenForEvent(
  url: string,
  headers: Record<string, string>,
  handler: () => void | Promise<void>,
  timeoutMs = 20000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(url, { headers });
    const timeout = setTimeout(() => {
      es.close();
      reject(new InternalError(`No SSE event received within ${timeoutMs / 1000}s`));
    }, timeoutMs);

    es.onopen = async () => {
      try {
        await handler();
      } catch (e) {
        clearTimeout(timeout);
        es.close();
        reject(e as Error);
      }
    };

    es.onmessage = (event) => {
      clearTimeout(timeout);
      es.close();
      resolve(JSON.parse(event.data));
    };

    es.onerror = (err) => {
      clearTimeout(timeout);
      es.close();
      reject(err as Error);
    };
  });
}

async function fetchJson(
  url: string,
  init?: RequestInit
): Promise<{ status: number; body: any }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function readSseEvent(
  url: string,
  headers: Record<string, string>,
  handler: () => void | Promise<void>,
  timeoutMs = 20000
): Promise<any> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    fetch(url, {
      headers: { Accept: "text/event-stream", ...headers },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status !== 200) {
          throw new InternalError(`SSE stream returned HTTP ${res.status}`);
        }
        await handler();
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const eventBlocks = buffer.split("\n\n");
          buffer = eventBlocks.pop() ?? "";
          for (const block of eventBlocks) {
            const dataLines = block
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim());
            if (!dataLines.length) continue;
            let parsed: any;
            try {
              parsed = JSON.parse(dataLines.join("\n"));
            } catch {
              continue;
            }
            if (Array.isArray(parsed)) {
              clearTimeout(timeout);
              try {
                controller.abort();
              } catch {
                // ignore abort errors
              }
              resolve(parsed);
              return;
            }
          }
        }
        clearTimeout(timeout);
        reject(new InternalError("SSE stream closed without an event"));
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (err?.name === "AbortError") {
          reject(
            new InternalError(
              `No SSE event received within ${timeoutMs / 1000}s`
            )
          );
        } else {
          reject(err);
        }
      });
  });
}

describe("G3-C2 SSE auth regression (secure default + opt-in + identity binding)", () => {
  describe("secure default (requireAuthenticated omitted -> auth required)", () => {
    it("rejects unauthenticated SSE stream and subscription requests with HTTP 401", async () => {
      const { app, serverUrl } = await buildApp({ subscriptionMode: true });
      try {
        const broadcast = await fetchJson(`${serverUrl}/events`);
        expect(broadcast.status).toBe(401);

        const modelStream = await fetchJson(`${serverUrl}/events/ProcessStep`);
        expect(modelStream.status).toBe(401);

        const subscribe = await fetchJson(`${serverUrl}/events/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topics: ["ProcessStep"] }),
        });
        expect(subscribe.status).toBe(401);

        const unsubscribe = await fetchJson(`${serverUrl}/events/unsubscribe`, {
          method: "POST",
        });
        expect(unsubscribe.status).toBe(401);
      } finally {
        await app.close();
      }
    });

    it("does not stream any event data to an anonymous client", async () => {
      const { app, serverUrl } = await buildApp({});
      try {
        const rawEvents: string[] = [];
        const source = new EventSource(`${serverUrl}/events`);
        const failed = new Promise<Error>((resolve, reject) => {
          const t = setTimeout(() => reject(new InternalError("no error")), 15000);
          source.onerror = (err) => {
            clearTimeout(t);
            resolve(err as Error);
          };
        });
        source.onmessage = (event) => {
          rawEvents.push(event.data);
        };

        await expect(failed).resolves.toBeTruthy();
        expect(rawEvents).toHaveLength(0);
        source.close();
      } finally {
        await app.close();
      }
    });
  });

  describe("opt-in anonymous broadcast (requireAuthenticated: false)", () => {
    it("streams events to an anonymous client", async () => {
      const { app, serverUrl } = await buildApp({
        requireAuthenticated: false,
      });
      try {
        const repo = Repository.forModel(ProcessStep);
        const record = new ProcessStep({
          id: `anon-${Math.random().toString(36).slice(2)}`,
          currentStep: 1,
          totalSteps: 1,
          label: "anon",
        });

        const event = await listenForEvent(
          `${serverUrl}/events`,
          {},
          async () => {
            await repo.create(record);
          }
        );

        expect(Array.isArray(event)).toBe(true);
        const [tableName, operationKey, id] = event;
        expect(operationKey).toBe(OperationKeys.CREATE);
        expect(id).toBe(record.id);
        expect(tableName).toBe(ProcessStep.name);
      } finally {
        await app.close();
      }
    });

    it("falls back to the x-correlation-id fingerprint when opted in", async () => {
      const { app, serverUrl } = await buildApp({
        subscriptionMode: true,
        requireAuthenticated: false,
      });
      try {
        const correlationId = `cor-${Math.random().toString(36).slice(2)}`;
        const res = await fetchJson(`${serverUrl}/events/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": correlationId,
          },
          body: JSON.stringify({ topics: ["ProcessStep"] }),
        });
        expect(res.status).toBe(201);
        expect(res.body.fingerprint).toBe(fingerprintLabel(correlationId));
      } finally {
        await app.close();
      }
    });
  });

  describe("authenticated identity binding", () => {
    it("binds the subscription fingerprint to the user, not the client-supplied correlation id", async () => {
      const { app, serverUrl } = await buildApp({
        subscriptionMode: true,
        auth: true,
      });
      try {
        const user = "alice-user";

        const anon = await fetchJson(`${serverUrl}/events/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-correlation-id": "client-corr-999",
          },
          body: JSON.stringify({ topics: ["ProcessStep"] }),
        });
        expect(anon.status).toBe(401);

        const res = await fetchJson(`${serverUrl}/events/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user}`,
            "x-correlation-id": "client-corr-999",
          },
          body: JSON.stringify({ topics: ["ProcessStep"] }),
        });
        expect(res.status).toBe(201);
        expect(res.body.topics).toEqual(["ProcessStep"]);
        expect(res.body.fingerprint).toBe(fingerprintLabel(user));
        expect(JSON.stringify(res.body)).not.toContain("client-corr");
      } finally {
        await app.close();
      }
    });

    it("lets an authenticated client open an SSE stream and receive events scoped to its identity", async () => {
      const { app, serverUrl } = await buildApp({
        subscriptionMode: true,
        auth: true,
      });
      try {
        const user = "alice-user";

        const sub = await fetchJson(`${serverUrl}/events/subscribe`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user}`,
          },
          body: JSON.stringify({ topics: ["ProcessStep"] }),
        });
        expect(sub.status).toBe(201);

        const repo = Repository.forModel(ProcessStep);
        const record = new ProcessStep({
          id: `authed-${Math.random().toString(36).slice(2)}`,
          currentStep: 1,
          totalSteps: 1,
          label: "authed",
        });

        const event = await readSseEvent(
          `${serverUrl}/events`,
          { Authorization: `Bearer ${user}` },
          async () => {
            await repo.create(record);
          }
        );

        expect(Array.isArray(event)).toBe(true);
        const [tableName, operationKey, id] = event;
        expect(operationKey).toBe(OperationKeys.CREATE);
        expect(id).toBe(record.id);
        expect(tableName).toBe(ProcessStep.name);
      } finally {
        await app.close();
      }
    });
  });
});
