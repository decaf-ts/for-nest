import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Adapter, Context, Repository } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { WebhookSubscription } from "@decaf-ts/for-http/hooks";
// @ts-expect-error paths
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { RequestToContextTransformer } from "@decaf-ts/for-http/server";
import { toKebabCase } from "@decaf-ts/logging";
import { Model } from "@decaf-ts/decorator-validation";
import { DecafExceptionFilter } from "../../src";
import { DecafWebhookModule } from "../../src/webhooks";

/**
 * G3-C4-followup HTTP-level bulk-IDOR regression for the F2 fix (SAA-1114).
 *
 * The controller-level regression (`webhook-from-model-owner-scoping.test.ts`)
 * asserts `AuthorizationError` is thrown and nothing is persisted on the exact
 * `scopeHandler` the `PUT|DELETE /{model}/bulk` routes invoke. This test closes
 * the remaining gap: it proves the rejection reaches the HTTP client as a 4xx
 * status and that a foreign-owned row is untouched over the live surface.
 *
 * Principal wiring: authenticates as principal A (owns no rows) via the
 * `Authorization: Bearer <user>` header, extracted into the request context by
 * the `WebhookRamTransformer` (same pattern as the webhook live integration
 * test). `resolvePrincipal` reads that `user` off the request context.
 *
 * Status note: the scoping fix throws `AuthorizationError` (code 401), which
 * `DecafExceptionFilter` maps to HTTP 401 (verified live: log line
 * `[AuthorizationError][401] Cannot operate on a webhook subscription owned by
 * a different principal`). The F2 acceptance criterion (SAA-1114) and the
 * security re-review (SAA-1115) stated 403 — a discrepancy flagged for the
 * Security Engineer. This test pins the actually-implemented, verified 401 so
 * it is a valid green regression; if 403 is the authoritative status the source
 * must throw `ForbiddenError` instead, which is a code change for the assigning
 * agent, and this assertion would then be updated to 403.
 */

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
Model.setBuilder(Model.fromModel);

jest.setTimeout(120000);

function userFromAuthorization(req: any): string | undefined {
  const auth = req?.headers?.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    return token || undefined;
  }
  return undefined;
}

class WebhookRamTransformer extends RequestToContextTransformer<any> {
  async from(req: any): Promise<any> {
    return {
      headers: req?.headers || {},
      overrides: {},
      user: userFromAuthorization(req),
    };
  }
}

function makeContext(operation: OperationKeys): Context {
  return Context.factory({
    operation,
    headers: {},
    overrides: {},
  } as any);
}

const WEBHOOK_API_PATH = "webhooks";
const modelPath = `/${WEBHOOK_API_PATH}/${toKebabCase(
  Model.tableName(WebhookSubscription as any)
)}`;

function bulkPath(): string {
  return `${modelPath}/bulk`;
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

describe("HTTP-level bulk-IDOR regression (F2 / SAA-1114)", () => {
  let app: INestApplication;
  let serverUrl: string;
  let repo: Repository<WebhookSubscription>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        await DecafWebhookModule.forRootAsync({
          conf: [[RamAdapter, {}, new WebhookRamTransformer()]],
          webhookApiPath: WEBHOOK_API_PATH,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.init();
    const server = await app.listen(0, "127.0.0.1");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve server address");
    }
    serverUrl = `http://127.0.0.1:${address.port}`;

    repo = Repository.forModel(WebhookSubscription);

    // Seed a subscription owned by principal B.
    await repo.create(
      new WebhookSubscription({
        topic: "bob.created",
        url: "http://b",
        secret: "bob-secret",
        active: true,
        owner: "bob",
      } as any),
      makeContext(OperationKeys.CREATE)
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  function authHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer alice",
    };
  }

  async function readStored(id: string): Promise<any | undefined> {
    try {
      return await repo.read(id, makeContext(OperationKeys.READ));
    } catch {
      return undefined;
    }
  }

  async function findBobRow(): Promise<any> {
    const rows = await repo
      .select()
      .where(repo.attr("owner").eq("bob"))
      .limit(1)
      .execute(makeContext(OperationKeys.READ));
    const row = (rows as any[])[0];
    expect(row).toBeDefined();
    return row;
  }

  it("returns a 4xx from PUT /webhook-subscriptions/bulk on a foreign-owned id and persists nothing", async () => {
    const foreign = await findBobRow();

    const tamper = [{ id: foreign.id, topic: "tampered", secret: "nefarious" }];
    const res = await fetchJson(`${serverUrl}${bulkPath()}`, {
      method: "PUT",
      headers: authHeaders(),
      body: JSON.stringify(tamper),
    });

    // F2 fix throws AuthorizationError (code 401), mapped to HTTP 401 by
    // DecafExceptionFilter — a 4xx rejection reaching the client. See the
    // module status note re: 401 vs 403 in the acceptance criterion.
    expect(res.status).toBe(401);

    const stored = await readStored(foreign.id);
    expect(stored).toBeDefined();
    expect(stored.topic).not.toBe("tampered");
    expect(stored.secret).toBe("bob-secret");
  });

  it("returns a 4xx from DELETE /webhook-subscriptions/bulk on a foreign-owned id and persists the row", async () => {
    const foreign = await findBobRow();

    const res = await fetchJson(
      `${serverUrl}${bulkPath()}?ids=${encodeURIComponent(foreign.id)}`,
      {
        method: "DELETE",
        headers: authHeaders(),
      }
    );

    expect(res.status).toBe(401);

    const stored = await readStored(foreign.id);
    expect(stored).toBeDefined();
    expect(stored.owner).toBe("bob");
  });
});
