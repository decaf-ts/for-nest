import { AuthorizationError } from "@decaf-ts/core";
import {
  EventsController,
  EventsSubscriptionController,
  ObserverSubscriptionRegistry,
} from "../../src/events-module";

function makeContext(user?: string, headers?: Record<string, string>) {
  return {
    uuid: "test-context",
    headers: headers ?? {},
    getOrUndefined: (key: string) => (key === "user" ? user : undefined),
  };
}

function makeEventsController(
  user?: string,
  headers?: Record<string, string>,
  options?: Record<string, unknown>
) {
  return new EventsController(
    makeContext(user, headers) as any,
    [],
    (options ?? {}) as any,
    new ObserverSubscriptionRegistry()
  );
}

function makeSubscriptionController(
  user?: string,
  options?: Record<string, unknown>
) {
  return new EventsSubscriptionController(
    makeContext(user) as any,
    { subscriptionMode: true, ...(options ?? {}) } as any,
    new ObserverSubscriptionRegistry()
  );
}

describe("SSE observer auth gate (requireAuthenticated)", () => {
  describe("EventsController.listen / listenForModel", () => {
    it("rejects an anonymous connection by default (secure default)", () => {
      const controller = makeEventsController();
      expect(() => controller.listen()).toThrow(AuthorizationError);
      expect(() => makeEventsController().listenForModel("ProcessStep")).toThrow(
        AuthorizationError
      );
    });

    it("rejects a correlation-id only requester by default", () => {
      const controller = makeEventsController(undefined, {
        "x-correlation-id": "corr-x",
      });
      expect(() => controller.listen()).toThrow(AuthorizationError);
    });

    it("allows an anonymous connection when requireAuthenticated is false", () => {
      expect(() =>
        makeEventsController(undefined, {}, { requireAuthenticated: false }).listen()
      ).not.toThrow();
      expect(() =>
        makeEventsController(undefined, {}, { requireAuthenticated: false }).listenForModel(
          "ProcessStep"
        )
      ).not.toThrow();
    });

    it("allows an authenticated user connection under the secure default", () => {
      expect(() => makeEventsController("alice-user").listen()).not.toThrow();
      expect(() =>
        makeEventsController("alice-user").listenForModel("ProcessStep")
      ).not.toThrow();
    });
  });

  describe("EventsSubscriptionController.subscribe / unsubscribe", () => {
    it("rejects an anonymous subscription by default (secure default)", async () => {
      const controller = makeSubscriptionController();
      await expect(
        controller.subscribe({ topics: ["ProcessStep"] })
      ).rejects.toThrow(AuthorizationError);
      expect(() => makeSubscriptionController().unsubscribe()).toThrow(
        AuthorizationError
      );
    });

    it("allows an anonymous subscription when requireAuthenticated is false", async () => {
      const controller = makeSubscriptionController(undefined, {
        requireAuthenticated: false,
      });
      const result = await controller.subscribe({ topics: ["ProcessStep"] });
      expect(result.topics).toEqual(["ProcessStep"]);
    });

    it("allows an authenticated user subscription under the secure default", async () => {
      const controller = makeSubscriptionController("alice-user");
      const result = await controller.subscribe({ topics: ["ProcessStep"] });
      expect(result.topics).toEqual(["ProcessStep"]);
    });
  });
});
