import "../../src/decoration";
import "../../src/overrides";

import { Adapter, Context, Repository } from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Logging } from "@decaf-ts/logging";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { uses } from "@decaf-ts/decoration";
import { Model } from "@decaf-ts/decorator-validation";
import { WebhookSubscription } from "@decaf-ts/for-http/hooks";
import { AuthorizationError } from "@decaf-ts/core";
import { DecafRequestContext } from "../../src/request/DecafRequestContext";
import { FromModelController } from "../../src/decaf-model/FromModelController";

/**
 * G3-C4-followup acceptance: owner scoping + write-only strip for the
 * from-model WebhookSubscription CRUD.
 *
 * `FromModelController.create(WebhookSubscription, { ownerScopedField: "owner" })`
 * (the config DecafWebhookModule wires) must scope the generated CRUD to the
 * authenticated principal recorded in the `owner` column:
 *  - a caller cannot read/update/delete another principal's subscription (IDOR);
 *  - list routes drop another principal's rows;
 *  - legacy rows without an owner remain viewable/operable by an authenticated
 *    caller;
 *  - create stamps the owner from the authenticated principal;
 *  - the write-only `secret` is stripped from read/update responses and can
 *    never be written through update.
 */

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
try {
  (Adapter as any).unregister?.(RamFlavour);
} catch {
  // ignore
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ramAdapter = new RamAdapter();
uses(RamFlavour)(WebhookSubscription);
Model.setBuilder(Model.fromModel);

function makeContext(operation: OperationKeys): Context {
  return new Context().accumulate({
    logger: Logging.get(),
    operation,
    headers: {},
    overrides: {},
  } as any);
}

function makeRequestContext(
  operation: OperationKeys,
  user?: string
): DecafRequestContext {
  const requestContext = new DecafRequestContext({} as any);
  requestContext.accumulate({
    logger: Logging.get(),
    operation,
    headers: {},
    overrides: {},
    user,
  } as any);
  return requestContext;
}

function makeController(user?: string) {
  const ControllerClass = FromModelController.create(WebhookSubscription, {
    WebhookSubscription: { ownerScopedField: "owner" },
  } as any);
  return new ControllerClass(makeRequestContext(OperationKeys.READ, user));
}

type Stored = { id: string; owner?: string };

describe("WebhookSubscription from-model CRUD owner scoping", () => {
  let repo: Repository<WebhookSubscription>;
  let aliceSub: Stored;
  let bobSub: Stored;
  let legacySub: Stored;

  beforeAll(async () => {
    repo = Repository.forModel(WebhookSubscription);
    const createCtx = makeContext(OperationKeys.CREATE);
    const [alice, bob, legacy] = await repo.createAll(
      [
        new WebhookSubscription({
          topic: "a.created",
          url: "http://a",
          secret: "alice-secret",
          active: true,
          owner: "alice",
        } as any),
        new WebhookSubscription({
          topic: "b.created",
          url: "http://b",
          secret: "bob-secret",
          active: true,
          owner: "bob",
        } as any),
        new WebhookSubscription({
          topic: "legacy.created",
          url: "http://legacy",
          secret: "legacy-secret",
          active: true,
        } as any),
      ],
      createCtx
    );
    aliceSub = { id: alice!.id, owner: alice!.owner };
    bobSub = { id: bob!.id, owner: bob!.owner };
    legacySub = { id: legacy!.id };
  });

  describe("single read", () => {
    it("returns the owning principal's subscription without the secret", async () => {
      const controller = makeController("alice");
      const result: any = await controller.read(aliceSub.id);
      expect(result.id).toBe(aliceSub.id);
      expect(result.owner).toBe("alice");
      expect(result).not.toHaveProperty("secret");
    });

    it("rejects reading another principal's subscription (IDOR)", async () => {
      const controller = makeController("alice");
      await expect(controller.read(bobSub.id)).rejects.toThrow(
        AuthorizationError
      );
    });

    it("allows reading a legacy unowned subscription for an authenticated caller", async () => {
      const controller = makeController("alice");
      const result: any = await controller.read(legacySub.id);
      expect(result.id).toBe(legacySub.id);
      expect(result).not.toHaveProperty("secret");
    });

    it("requires an authenticated principal for a scoped read", async () => {
      const controller = makeController(undefined);
      await expect(controller.read(aliceSub.id)).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe("list routes", () => {
    it("bulk read filters out another principal's rows", async () => {
      const controller = makeController("alice");
      const rows: any[] = await controller.readAll([
        aliceSub.id,
        bobSub.id,
      ]);
      expect(rows.map((r) => r.id)).toEqual([aliceSub.id]);
      expect(rows[0]).not.toHaveProperty("secret");
    });

    it("listBy filters out another principal's rows", async () => {
      const controller = makeController("alice");
      const rows: any[] = await controller.listBy("owner", {
        direction: "ASC",
      });
      expect(rows.length).toBeGreaterThan(0);
      const ids = rows.map((r) => r.id);
      // Bob's subscription must never surface to Alice.
      expect(ids).not.toContain(bobSub.id);
      // Alice's own row and the legacy unowned row remain visible.
      expect(ids).toContain(aliceSub.id);
      expect(ids).toContain(legacySub.id);
      for (const row of rows) {
        expect(row).not.toHaveProperty("secret");
      }
    });
  });

  describe("update", () => {
    it("strips the write-only secret from the update response", async () => {
      const controller = makeController("alice");
      const result: any = await controller.update(
        { topic: "a.updated", secret: "nefarious" },
        aliceSub.id
      );
      expect(result.id).toBe(aliceSub.id);
      expect(result.topic).toBe("a.updated");
      expect(result).not.toHaveProperty("secret");
    });

    it("never persists a secret sent through update", async () => {
      const controller = makeController("alice");
      await controller.update(
        { topic: "a.updated-2", secret: "nefarious" },
        aliceSub.id
      );
      const stored: any = await repo.read(aliceSub.id, makeContext(OperationKeys.READ));
      expect(stored.secret).toBe("alice-secret");
      expect(stored.topic).toBe("a.updated-2");
    });

    it("rejects updating another principal's subscription (IDOR)", async () => {
      const controller = makeController("alice");
      await expect(
        controller.update({ topic: "x", secret: "y" }, bobSub.id)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe("bulk update / delete ownership (F2 mass-IDOR)", () => {
    it("rejects a bulk update of another principal's subscription and persists nothing", async () => {
      const controller = makeController("alice");
      const tamper = [{ id: bobSub.id, topic: "tampered", secret: "x" }];
      await expect(controller.updateAll(tamper)).rejects.toThrow(
        AuthorizationError
      );
      const stored: any = await repo.read(
        bobSub.id,
        makeContext(OperationKeys.READ)
      );
      expect(stored.topic).not.toBe("tampered");
      expect(stored.secret).toBe("bob-secret");
    });

    it("rejects a bulk update mixing an own id with a foreign id and persists nothing", async () => {
      const controller = makeController("alice");
      await expect(
        controller.updateAll([
          { id: aliceSub.id, topic: "a-own-update", secret: "x" },
          { id: bobSub.id, topic: "b-foreign-update", secret: "y" },
        ])
      ).rejects.toThrow(AuthorizationError);
      const aliceStored: any = await repo.read(
        aliceSub.id,
        makeContext(OperationKeys.READ)
      );
      expect(aliceStored.topic).not.toBe("a-own-update");
    });

    it("allows a bulk update of only the owning principal's rows", async () => {
      const controller = makeController("alice");
      const updated: any[] = await controller.updateAll([
        { id: aliceSub.id, topic: "a-ok-update" },
      ]);
      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe(aliceSub.id);
      expect(updated[0].topic).toBe("a-ok-update");
    });

    it("rejects a bulk delete of another principal's subscription and persists the row", async () => {
      const controller = makeController("alice");
      await expect(controller.deleteAll([bobSub.id])).rejects.toThrow(
        AuthorizationError
      );
      const stored: any = await repo.read(
        bobSub.id,
        makeContext(OperationKeys.READ)
      );
      expect(stored).toBeDefined();
      expect(stored.owner).toBe("bob");
    });

    it("rejects a bulk delete mixing an own id with a foreign id and deletes nothing", async () => {
      const controller = makeController("alice");
      await expect(
        controller.deleteAll([aliceSub.id, bobSub.id])
      ).rejects.toThrow(AuthorizationError);
      const aliceStored: any = await repo.read(
        aliceSub.id,
        makeContext(OperationKeys.READ)
      );
      const bobStored: any = await repo.read(
        bobSub.id,
        makeContext(OperationKeys.READ)
      );
      expect(aliceStored).toBeDefined();
      expect(bobStored).toBeDefined();
    });

    it("allows a bulk delete of only the owning principal's rows", async () => {
      const controller = makeController("alice");
      const deleted: any[] = await controller.deleteAll([aliceSub.id]);
      expect(deleted).toHaveLength(1);
      await expect(
        repo.read(aliceSub.id, makeContext(OperationKeys.READ))
      ).rejects.toThrow();
    });
  });

  describe("create", () => {
    it("stamps the owner from the authenticated principal", async () => {
      const controller = makeController("carol");
      const created: any = await controller.create({
        topic: "c.created",
        url: "http://c",
        secret: "carol-secret",
        active: true,
      });
      expect(created.owner).toBe("carol");
      expect(created).not.toHaveProperty("secret");
    });

    it("always overwrites a client-supplied owner from the authenticated principal (F5)", async () => {
      const controller = makeController("carol");
      const created: any = await controller.create({
        topic: "d.created",
        url: "http://d",
        secret: "carol-secret",
        active: true,
        owner: "eve",
      });
      expect(created.owner).toBe("carol");
      const stored: any = await repo.read(
        created.id,
        makeContext(OperationKeys.READ)
      );
      expect(stored.owner).toBe("carol");
    });

    it("always overwrites client-supplied owners in a bulk create (F5)", async () => {
      const controller = makeController("carol");
      const created: any[] = await controller.createAll([
        new WebhookSubscription({
          topic: "e.created",
          url: "http://e",
          secret: "e-secret",
          active: true,
          owner: "eve",
        } as any),
        new WebhookSubscription({
          topic: "f.created",
          url: "http://f",
          secret: "f-secret",
          active: true,
          owner: "mallory",
        } as any),
      ]);
      expect(created.map((c) => c.owner)).toEqual(["carol", "carol"]);
      expect(created[0]).not.toHaveProperty("secret");
      expect(created[1]).not.toHaveProperty("secret");
    });
  });
});
