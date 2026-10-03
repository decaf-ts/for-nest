import { AuthorizationError, Repository } from "@decaf-ts/core";
import { WebhookEventRecord } from "@decaf-ts/for-http/hooks";
import {
  WebhookSubscriptionActionsController,
  WebhookEventActionsController,
  resolvePrincipal,
  assertOwnership,
} from "../../src/webhooks/controllers";

/**
 * G3-C4 route-level IDOR regression cases for the webhook lifecycle / action
 * controllers.
 *
 * The webhook routes `POST webhook-subscriptions/:id/deactivate`,
 * `POST webhook-subscriptions/:id/reactivate` and
 * `POST webhook-events/:id/replay` used to take a bare id with NO tenant/owner
 * scoping, so any caller could replay or toggle another principal's event or
 * subscription (a spam/proxy cannon compounding the SSRF risk).
 *
 * These cases assert the fixed contract:
 *  - the routes require an authenticated principal (anonymous -> AuthorizationError);
 *  - a caller cannot operate on a resource owned by a different principal (IDOR);
 *  - a resource recorded as unowned (legacy) remains operable for an authenticated caller;
 *  - a caller may operate on a resource it owns.
 */

function makeContext(user?: string) {
  return {
    uuid: "webhook-idor-context",
    headers: {},
    getOrUndefined: (key: string) => (key === "user" ? user : undefined),
  } as any;
}

function makeFakeRepo(resource: any, rows: any[] = [resource]) {
  const paginator = { page: jest.fn().mockResolvedValue(rows) };
  const selectChain = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    thenBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    paginate: jest.fn().mockResolvedValue(paginator),
    execute: jest.fn().mockResolvedValue(rows),
  };
  return {
    read: jest.fn().mockResolvedValue(resource),
    update: jest.fn().mockImplementation(async (m: any) => m),
    select: jest.fn().mockReturnValue(selectChain),
  };
}

function stubLogCtx(controller: any) {
  controller.logCtx = jest.fn().mockResolvedValue({
    for: () => ({ ctx: makeContext(undefined) }),
  });
  return controller;
}

describe("Webhook lifecycle route IDOR (scoped to authenticated principal)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("resolvePrincipal", () => {
    it("throws for an unauthenticated request", () => {
      expect(() => resolvePrincipal(makeContext(undefined))).toThrow(
        AuthorizationError
      );
    });

    it("returns the authenticated principal", () => {
      expect(resolvePrincipal(makeContext("alice"))).toBe("alice");
    });
  });

  describe("assertOwnership", () => {
    it("allows a principal to operate on its own resource", () => {
      expect(() =>
        assertOwnership("alice", { owner: "alice" }, "subscription")
      ).not.toThrow();
    });

    it("rejects a cross-principal access (IDOR)", () => {
      expect(() =>
        assertOwnership("alice", { owner: "bob" }, "subscription")
      ).toThrow(AuthorizationError);
    });

    it("allows an authenticated principal to operate on a legacy unowned resource", () => {
      expect(() =>
        assertOwnership("alice", { owner: undefined }, "subscription")
      ).not.toThrow();
    });
  });

  describe("WebhookSubscriptionActionsController", () => {
    it("deactivate requires an authenticated principal", async () => {
      const controller = stubLogCtx(
        new WebhookSubscriptionActionsController(makeContext(undefined))
      );
      jest
        .spyOn(Repository, "forModel")
        .mockReturnValue(makeFakeRepo({ id: "s1", active: true }) as any);
      await expect(controller.deactivate("s1")).rejects.toThrow(
        AuthorizationError
      );
    });

    it("deactivate rejects a subscription owned by a different principal", async () => {
      const controller = stubLogCtx(
        new WebhookSubscriptionActionsController(makeContext("alice"))
      );
      jest
        .spyOn(Repository, "forModel")
        .mockReturnValue(
          makeFakeRepo({ id: "s1", active: true, owner: "bob" }) as any
        );
      await expect(controller.deactivate("s1")).rejects.toThrow(
        AuthorizationError
      );
    });

    it("deactivate allows the owning principal to deactivate", async () => {
      const controller = stubLogCtx(
        new WebhookSubscriptionActionsController(makeContext("alice"))
      );
      const repo = makeFakeRepo({ id: "s1", active: true, owner: "alice" });
      jest.spyOn(Repository, "forModel").mockReturnValue(repo as any);
      const result = await controller.deactivate("s1");
      expect(result.active).toBe(false);
      expect(repo.update).toHaveBeenCalled();
    });

    it("reactivate rejects a subscription owned by a different principal", async () => {
      const controller = stubLogCtx(
        new WebhookSubscriptionActionsController(makeContext("alice"))
      );
      jest
        .spyOn(Repository, "forModel")
        .mockReturnValue(
          makeFakeRepo({ id: "s1", active: false, owner: "bob" }) as any
        );
      await expect(controller.reactivate("s1")).rejects.toThrow(
        AuthorizationError
      );
    });
  });

  describe("WebhookEventActionsController", () => {
    it("replay requires an authenticated principal", async () => {
      const controller = stubLogCtx(
        new WebhookEventActionsController(makeContext(undefined))
      );
      jest
        .spyOn(Repository, "forModel")
        .mockReturnValue(
          makeFakeRepo({ id: "e1", status: "pending", deliveriesTotal: 1 }) as any
        );
      await expect(controller.replay("e1")).rejects.toThrow(
        AuthorizationError
      );
    });

    it("replay rejects an event owned by a different principal (IDOR)", async () => {
      const controller = stubLogCtx(
        new WebhookEventActionsController(makeContext("alice"))
      );
      jest
        .spyOn(Repository, "forModel")
        .mockReturnValue(
          makeFakeRepo({ id: "e1", status: "pending", owner: "bob" }) as any
        );
      await expect(controller.replay("e1")).rejects.toThrow(
        AuthorizationError
      );
    });

    it("replay allows the owning principal to replay their event", async () => {
      const controller = stubLogCtx(
        new WebhookEventActionsController(makeContext("alice"))
      );
      const eventRepo = makeFakeRepo({
        id: "e1",
        status: "pending",
        owner: "alice",
        deliveriesTotal: 0,
      });
      const deliveryRepo = makeFakeRepo(undefined, []);
      jest
        .spyOn(Repository, "forModel")
        .mockImplementation((clazz: any) =>
          clazz === WebhookEventRecord
            ? (eventRepo as any)
            : (deliveryRepo as any)
        );
      const result = await controller.replay("e1");
      expect(result.status).toBe("pending");
    });
  });
});
