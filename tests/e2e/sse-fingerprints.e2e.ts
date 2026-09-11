/**
 * SSE requester fingerprints, connection claims and subscriptions, exercised
 * with raw streaming HTTP clients (independent of the for-http client).
 *
 * Covers: several streams of the same authenticated user (tabs/devices),
 * per-client subscriptions of the same user, reconnection of a client whose
 * previous stream is still open, cleanup of a closed client's subscriptions,
 * the opt-in `authenticate` option and the `/:model` stream.
 */
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Adapter, Repository } from "@decaf-ts/core";
// @ts-expect-error ram
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { InternalError } from "@decaf-ts/db-decorators";
import { DecafModule, ObserverSubscriptionRegistry } from "../../src";
import { DecafExceptionFilter } from "../../src/factory/exceptions";
import { AuthModule } from "./fakes/auth.module";
import { ProcessStep } from "./fakes/models/ProcessStep";
import { Fake } from "./fakes/models/Fake";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
jest.setTimeout(30000);

type SseClient = {
  status: number;
  events: unknown[][];
  errors: string[];
  ended: () => boolean;
  close: () => void;
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await delay(20);
  }
  return predicate();
}

/** number of SSE observers the backend registered — one per live stream */
function liveStreams(): number {
  return (Adapter.get(RamFlavour) as any)?.observerHandler?.count() ?? 0;
}

async function openStream(url: string, headers: Record<string, string> = {}): Promise<SseClient> {
  const abort = new AbortController();
  const response = await fetch(url, {
    headers: { accept: "text/event-stream", ...headers },
    signal: abort.signal,
  });
  let ended = false;
  const client: SseClient = {
    status: response.status,
    events: [],
    errors: [],
    ended: () => ended,
    close: () => abort.abort(),
  };
  void (async () => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const type = /^event: (.*)$/m.exec(block)?.[1] ?? "message";
          const data = /^data: (.*)$/m.exec(block)?.[1] ?? "";
          if (type === "error") client.errors.push(data);
          else if (type === "message") client.events.push(JSON.parse(data));
        }
      }
    } catch {
      // aborted
    } finally {
      ended = true;
    }
  })();
  return client;
}

/**
 * Binds the bearer's user to every request context, as an application-wide auth
 * layer would — independently of the events module's `authenticate` option.
 */
class BearerIdentityHandler {
  async handle(context: any, req: any): Promise<void> {
    const user = req?.headers?.authorization?.split(" ")[1];
    if (user) context.accumulate({ user });
  }
}

async function backend(
  options: Record<string, unknown>,
  identifyRequests = false
): Promise<{ app: INestApplication; url: string }> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      AuthModule,
      await DecafModule.forRootAsync({
        conf: [[RamAdapter, {}]],
        autoControllers: true,
        autoServices: false,
        handlers: identifyRequests ? [BearerIdentityHandler] : [],
        observerOptions: { enableObserverEvents: true, ...options },
      } as any),
    ],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.useGlobalFilters(new DecafExceptionFilter());
  await app.init();
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") throw new InternalError("no address");
  return { app, url: `http://127.0.0.1:${address.port}/events` };
}

const bearer = (user: string) => ({ authorization: `Bearer ${user}` });
const ids = (client: SseClient) => client.events.map((e) => `${e[0]}:${e[1]}:${e[2]}`);
let seq = 0;
const newProcessStep = () =>
  new ProcessStep({ id: `ps-${++seq}-${Math.random().toString(36).slice(2, 6)}`, currentStep: 1, totalSteps: 1, label: "l" });
const newFake = () => new Fake({ id: `fk-${++seq}-${Math.random().toString(36).slice(2, 6)}`, name: "n" });

describe("SSE fingerprints and connection claims", () => {
  let app: INestApplication;
  let url: string;
  let clients: SseClient[] = [];

  const open = async (headers: Record<string, string> = {}, target = url) => {
    const client = await openStream(target, headers);
    clients.push(client);
    return client;
  };

  afterEach(async () => {
    clients.forEach((c) => c.close());
    clients = [];
    await waitFor(() => liveStreams() === 0);
    app?.getHttpServer().closeAllConnections?.(); // idle keep-alive sockets
    await app?.close();
  });

  describe("broadcast mode, streams identified by user", () => {
    beforeEach(async () => {
      ({ app, url } = await backend({}, true));
    });

    it("keeps every stream of the same user open and delivers each event once to each", async () => {
      const tabs = [await open(bearer("alice")), await open(bearer("alice")), await open(bearer("alice"))];
      expect(await waitFor(() => liveStreams() === 3)).toBe(true);

      const created = [newProcessStep(), newProcessStep()];
      for (const step of created) await Repository.forModel(ProcessStep).create(step);
      await waitFor(() => tabs.every((t) => t.events.length >= 2));
      await delay(200);

      for (const tab of tabs) {
        expect(tab.errors).toEqual([]);
        expect(tab.ended()).toBe(false);
        expect(ids(tab)).toEqual(created.map((s) => `ProcessStep:create:${s.id}`));
      }
    });
  });

  describe("`authenticate` option", () => {
    beforeEach(async () => {
      ({ app, url } = await backend({ authenticate: true }));
    });

    it("rejects a stream without credentials with an HTTP 401", async () => {
      const anonymous = await open();
      expect(anonymous.status).toBe(401);
      expect(await waitFor(() => anonymous.ended())).toBe(true);
      expect(liveStreams()).toBe(0);
    });

    it("accepts every stream of an authenticated user", async () => {
      const tabs = [await open(bearer("bob")), await open(bearer("bob"))];
      expect(await waitFor(() => liveStreams() === 2)).toBe(true);
      const step = newProcessStep();
      await Repository.forModel(ProcessStep).create(step);
      await waitFor(() => tabs.every((t) => t.events.length >= 1));
      for (const tab of tabs) {
        expect(tab.errors).toEqual([]);
        expect(ids(tab)).toEqual([`ProcessStep:create:${step.id}`]);
      }
    });
  });

  describe("`authenticate` option with subscription mode", () => {
    beforeEach(async () => {
      ({ app, url } = await backend({ authenticate: true, subscriptionMode: true }));
    });

    it("authenticates subscribe and scopes the client by the authenticated user", async () => {
      const registry = app.get(ObserverSubscriptionRegistry, { strict: false });
      const anonymous = await fetch(`${url}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-correlation-id": "tab" },
        body: JSON.stringify({ topics: ["ProcessStep.*"] }),
      });
      expect(anonymous.status).toBe(401);

      const subscribed = await fetch(`${url}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-correlation-id": "tab", ...bearer("bob") },
        body: JSON.stringify({ topics: ["ProcessStep.*"] }),
      });
      expect(subscribed.status).toBe(201);
      expect(registry.topicsFor("user:bob:tab")).toEqual(["ProcessStep.*"]);
      expect(registry.topicsFor("cid:tab")).toEqual([]);

      const client = await open({ "x-correlation-id": "tab", ...bearer("bob") });
      expect(await waitFor(() => liveStreams() === 1)).toBe(true);
      const step = newProcessStep();
      await Repository.forModel(ProcessStep).create(step);
      expect(await waitFor(() => client.events.length === 1)).toBe(true);
    });
  });

  describe("subscription mode, streams identified by user", () => {
    let registry: ObserverSubscriptionRegistry;

    beforeEach(async () => {
      ({ app, url } = await backend({ subscriptionMode: true }, true));
      registry = app.get(ObserverSubscriptionRegistry, { strict: false });
    });

    const subscribe = (headers: Record<string, string>, topics: string[]) =>
      fetch(`${url}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ topics }),
      });
    const unsubscribe = (headers: Record<string, string>) =>
      fetch(`${url}/unsubscribe`, { method: "POST", headers });

    it("gives each client (tab) of the same user its own subscriptions", async () => {
      const tabA = { ...bearer("alice"), "x-correlation-id": "tab-a" };
      const tabB = { ...bearer("alice"), "x-correlation-id": "tab-b" };
      await subscribe(tabA, ["ProcessStep.*"]);
      await subscribe(tabB, ["Fake.*"]);
      const [a, b] = [await open(tabA), await open(tabB)];
      expect(await waitFor(() => liveStreams() === 2)).toBe(true);

      const step = newProcessStep();
      const fake = newFake();
      await Repository.forModel(ProcessStep).create(step);
      await Repository.forModel(Fake).create(fake);
      await waitFor(() => a.events.length >= 1 && b.events.length >= 1);
      await delay(200);

      expect(a.errors).toEqual([]);
      expect(b.errors).toEqual([]);
      expect(ids(a)).toEqual([`ProcessStep:create:${step.id}`]);
      expect(ids(b)).toEqual([`Fake:create:${fake.id}`]);
    });

    it("keeps the user's other tabs subscribed when one tab unsubscribes", async () => {
      const tabA = { ...bearer("alice"), "x-correlation-id": "tab-a" };
      const tabB = { ...bearer("alice"), "x-correlation-id": "tab-b" };
      await subscribe(tabA, ["ProcessStep.*"]);
      await subscribe(tabB, ["ProcessStep.*"]);
      const b = await open(tabB);
      expect(await waitFor(() => liveStreams() === 1)).toBe(true);

      await unsubscribe(tabA);
      const step = newProcessStep();
      await Repository.forModel(ProcessStep).create(step);
      expect(await waitFor(() => b.events.length === 1)).toBe(true);
    });

    it("does not let another user act on a client's subscription by reusing its correlation id", async () => {
      const alice = { ...bearer("alice"), "x-correlation-id": "shared-cid" };
      const mallory = { ...bearer("mallory"), "x-correlation-id": "shared-cid" };
      await subscribe(alice, ["ProcessStep.*"]);
      const a = await open(alice);
      expect(await waitFor(() => liveStreams() === 1)).toBe(true);

      await unsubscribe(mallory);
      await subscribe(mallory, ["Fake.*"]);
      const step = newProcessStep();
      await Repository.forModel(ProcessStep).create(step);
      expect(await waitFor(() => a.events.length === 1)).toBe(true);
      expect(ids(a)).toEqual([`ProcessStep:create:${step.id}`]);
    });

    it("lets a reconnecting client take over its previous stream instead of rejecting it", async () => {
      const tab = { ...bearer("alice"), "x-correlation-id": "tab-r" };
      await subscribe(tab, ["ProcessStep.*"]);
      const previous = await open(tab);
      expect(await waitFor(() => liveStreams() === 1)).toBe(true);

      const current = await open(tab);
      expect(await waitFor(() => previous.ended())).toBe(true);
      expect(await waitFor(() => liveStreams() === 1)).toBe(true);

      const step = newProcessStep();
      await Repository.forModel(ProcessStep).create(step);
      expect(await waitFor(() => current.events.length === 1)).toBe(true);
      await delay(200);
      expect(current.errors).toEqual([]);
      expect(ids(current)).toEqual([`ProcessStep:create:${step.id}`]);
      expect(previous.events).toEqual([]);
    });

    it("drops a client's subscriptions once its stream closes", async () => {
      const tab = { ...bearer("alice"), "x-correlation-id": "tab-gone" };
      await subscribe(tab, ["ProcessStep.*"]);
      const client = await open(tab);
      expect(await waitFor(() => liveStreams() === 1)).toBe(true);
      const recorded = () => (registry as any).records.size as number;
      expect(recorded()).toBe(1);

      client.close();
      expect(await waitFor(() => liveStreams() === 0)).toBe(true);
      expect(await waitFor(() => recorded() === 0)).toBe(true);
    });
  });

  describe("per-model stream", () => {
    beforeEach(async () => {
      ({ app, url } = await backend({ subscriptionMode: true }));
    });

    it("/events/:model only streams that model's events in subscription mode", async () => {
      const cid = { "x-correlation-id": "per-model" };
      await fetch(`${url}/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json", ...cid },
        body: JSON.stringify({ topics: ["*"] }),
      });
      const client = await open(cid, `${url}/ProcessStep`);
      expect(await waitFor(() => liveStreams() === 1)).toBe(true);

      await Repository.forModel(Fake).create(newFake());
      const step = newProcessStep();
      await Repository.forModel(ProcessStep).create(step);
      await waitFor(() => client.events.length >= 1);
      await delay(200);

      // raw observer arguments: [model, operation, id, ...]
      expect(client.events.map((e) => `${e[1]}:${e[2]}`)).toEqual([`create:${step.id}`]);
    });
  });
});
