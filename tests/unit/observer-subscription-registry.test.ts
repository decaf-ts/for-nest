import { ObserverSubscriptionRegistry } from "../../src/events-module/ObserverSubscriptionRegistry";
import {
  eventTopicFor,
  resolveRequesterFingerprint,
} from "../../src/events-module/utils";
import { matchesTopic } from "@decaf-ts/for-http/hooks";

describe("ObserverSubscriptionRegistry — agnostic webhook topics and fingerprints (DECAF-48)", () => {
  let registry: ObserverSubscriptionRegistry;

  beforeEach(() => {
    registry = new ObserverSubscriptionRegistry();
  });

  it("upsert stores topics and echoes them back, keyed by fingerprint", () => {
    registry.upsert("s1", ["ProcessStep.*"]);
    expect(registry.topicsFor("s1")).toEqual(["ProcessStep.*"]);
    expect(registry.get("s1")?.fingerprint).toBe("s1");
    expect(registry.get("s1")?.topics).toEqual(["ProcessStep.*"]);
  });

  it("upsert deduplicates, drops empty/whitespace-only topics, and keeps the * catch-all", () => {
    registry.upsert("s1", ["ProcessStep.*", "ProcessStep.*", "", "  ", " * "]);
    expect(registry.topicsFor("s1")).toEqual(["ProcessStep.*", "*"]);
  });

  it("matches() is false for unknown fingerprint or no topics", () => {
    expect(registry.matches("ghost", "ProcessStep.create.1")).toBe(false);
    registry.upsert("none", []);
    expect(registry.matches("none", "ProcessStep.create.1")).toBe(false);
  });

  it("matches() is keyed by fingerprint: same topics under different fingerprints stay isolated", () => {
    registry.upsert("s1", ["ProcessStep.*"]);
    registry.upsert("s2", ["Fake.*"]);
    expect(registry.matches("s1", "ProcessStep.create.1")).toBe(true);
    expect(registry.matches("s2", "ProcessStep.create.1")).toBe(false);
    expect(registry.matches("s1", "Fake.create.1")).toBe(false);
    expect(registry.matches("s2", "Fake.create.1")).toBe(true);
  });

  it("matches() supports the default webhook topic form <model>.*", () => {
    registry.upsert("s1", ["ProcessStep.*"]);
    expect(registry.matches("s1", "ProcessStep.create.1")).toBe(true);
    expect(registry.matches("s1", "ProcessStep.update.1")).toBe(true);
    expect(registry.matches("s1", "ProcessStep")).toBe(true);
    expect(registry.matches("s1", "Other.create.1")).toBe(false);
  });

  it("matches() is backward-compatible with bare model names", () => {
    registry.upsert("s1", ["ProcessStep"]);
    expect(registry.matches("s1", "ProcessStep.create.1")).toBe(true);
    expect(registry.matches("s1", "ProcessStep.delete.99")).toBe(true);
  });

  it("matches() supports the enhanced <model>.<action>.<id> webhook form", () => {
    registry.upsert("s1", ["ProcessStep.create.7"]);
    expect(registry.matches("s1", "ProcessStep.create.7")).toBe(true);
    expect(registry.matches("s1", "ProcessStep.update.7")).toBe(false);
    expect(registry.matches("s1", "ProcessStep.create.8")).toBe(false);

    registry.upsert("s2", ["ProcessStep.*.7"]);
    expect(registry.matches("s2", "ProcessStep.create.7")).toBe(true);
    expect(registry.matches("s2", "ProcessStep.delete.7")).toBe(true);
    expect(registry.matches("s2", "ProcessStep.create.8")).toBe(false);
  });

  it("matches() does not treat a mid-stream * as a greedy wildcard", () => {
    registry.upsert("s1", ["ProcessStep.*.state"]);
    expect(registry.matches("s1", "ProcessStep.create.log.state")).toBe(false);
    expect(registry.matches("s1", "ProcessStep.create.state")).toBe(true);
  });

  it("matches() understands the catch-all topic", () => {
    registry.upsert("s1", ["*"]);
    expect(registry.matches("s1", "Anything.create.1")).toBe(true);
  });

  describe("single connection per client fingerprint", () => {
    it("claims a fingerprint and refuses a second claim for the same one", () => {
      expect(registry.claimConnection("client-a")).toBe(true);
      expect(registry.claimConnection("client-a")).toBe(false);
      expect(registry.claimConnection("client-b")).toBe(true);
    });

    it("releases the claim so a client may reconnect after disconnect", () => {
      expect(registry.claimConnection("client-a")).toBe(true);
      registry.releaseConnection("client-a");
      expect(registry.claimConnection("client-a")).toBe(true);
    });

    it("refuses an empty fingerprint", () => {
      expect(registry.claimConnection("")).toBe(false);
    });
  });

  describe("remove — cleanup removes the record", () => {
    it("record disappears after remove", () => {
      registry.upsert("s1", ["ProcessStep.*"]);
      expect(registry.remove("s1")).toBe(true);
      expect(registry.get("s1")).toBeUndefined();
      expect(registry.matches("s1", "ProcessStep.create.1")).toBe(false);
      expect(registry.remove("s1")).toBe(false);
    });
  });
});

describe("matchesTopic reuse (for-http/hooks) — the topic matcher behind registry.matches (DECAF-48)", () => {
  it("bare model is treated as <model>.* — all events for that table", () => {
    expect(matchesTopic("ProcessStep.create.7", "ProcessStep")).toBe(true);
    expect(matchesTopic("ProcessStep.update.1", "ProcessStep")).toBe(true);
    expect(matchesTopic("ProcessStep", "ProcessStep")).toBe(true);
    expect(matchesTopic("Other.create.7", "ProcessStep")).toBe(false);
  });

  it("matches the default webhook form <model>.*", () => {
    expect(matchesTopic("ProcessStep.create.7", "ProcessStep.*")).toBe(true);
    expect(matchesTopic("ProcessStep.delete.99", "ProcessStep.*")).toBe(true);
    expect(matchesTopic("Other.create.1", "ProcessStep.*")).toBe(false);
  });

  it("matches the enhanced form <model>.<action>.<id>", () => {
    expect(matchesTopic("ProcessStep.create.7", "ProcessStep.create.7")).toBe(
      true
    );
    expect(matchesTopic("ProcessStep.update.7", "ProcessStep.create.7")).toBe(
      false
    );
    expect(matchesTopic("ProcessStep.create.8", "ProcessStep.create.7")).toBe(
      false
    );
  });

  it("matches the enhanced wildcard form <model>.*.<id>", () => {
    expect(matchesTopic("ProcessStep.create.7", "ProcessStep.*.7")).toBe(true);
    expect(matchesTopic("ProcessStep.delete.7", "ProcessStep.*.7")).toBe(true);
    expect(matchesTopic("ProcessStep.create.8", "ProcessStep.*.7")).toBe(false);
  });

  it("a trailing * swallows any remaining segments", () => {
    expect(matchesTopic("ProcessStep.create", "ProcessStep.create.*")).toBe(
      true
    );
    expect(
      matchesTopic("ProcessStep.create.1.2.3", "ProcessStep.create.*")
    ).toBe(true);
    expect(
      matchesTopic("ProcessStep.clear.all.things", "ProcessStep.*")
    ).toBe(true);
  });

  it("understands the * and *.* catch-alls", () => {
    expect(matchesTopic("Anything.create.1", "*")).toBe(true);
    expect(matchesTopic("Anything.create.1", "*.*")).toBe(true);
    expect(matchesTopic("", "*")).toBe(false);
    expect(matchesTopic("Anything.create.1", "")).toBe(false);
  });

  it("does not treat a mid-stream * as greedy", () => {
    expect(matchesTopic("ProcessStep.create.log.state", "ProcessStep.*.state")).toBe(
      false
    );
    expect(matchesTopic("ProcessStep.create.state", "ProcessStep.*.state")).toBe(
      true
    );
  });
});

describe("eventTopicFor (EventsController filter helper)", () => {
  it("builds <model>.<action>.<id> for a scalar id", () => {
    expect(eventTopicFor("ProcessStep", "create", "7")).toBe(
      "ProcessStep.create.7"
    );
  });

  it("builds <model>.<action> when no id is available", () => {
    expect(eventTopicFor("ProcessStep", "update", undefined)).toBe(
      "ProcessStep.update"
    );
  });

  it("derives the model name from a constructor", () => {
    class ProcessStep {}
    expect(eventTopicFor(ProcessStep, "delete", 3)).toBe("ProcessStep.delete.3");
  });

  it("ignores array ids and empty model names", () => {
    expect(eventTopicFor("ProcessStep", "create", [1, 2])).toBe(
      "ProcessStep.create"
    );
    expect(eventTopicFor(undefined, "create", 1)).toBe("");
  });
});

describe("resolveRequesterFingerprint — requester identification (2.3)", () => {
  const ctx = (init?: { user?: unknown; correlationId?: string }) => ({
    getOrUndefined: (key: string) =>
      key === "user" ? init?.user : undefined,
    headers:
      init?.correlationId !== undefined
        ? { "x-correlation-id": init.correlationId }
        : {},
  });

  it("prefers the authenticated user identity", () => {
    const { value, kind } = resolveRequesterFingerprint(
      ctx({ user: "alice" }),
      "fallback"
    );
    expect(kind).toBe("user");
    expect(value).toBe("alice");
  });

  it("authenticated user wins over a conflicting x-correlation-id header", () => {
    const { value, kind } = resolveRequesterFingerprint(
      {
        getOrUndefined: () => "alice",
        headers: { "x-correlation-id": "evil-cid" },
      },
      "fallback"
    );
    expect(kind).toBe("user");
    expect(value).toBe("alice");
  });

  it("extracts a user identity object via its id/uuid/user property", () => {
    const { value, kind } = resolveRequesterFingerprint(
      ctx({ user: { id: "alice-42" } }),
      "fallback"
    );
    expect(kind).toBe("user");
    expect(value).toBe("alice-42");
  });

  it("falls back to the x-correlation-id header when not authenticated", () => {
    const { value, kind } = resolveRequesterFingerprint(
      ctx({ correlationId: "corr-42" }),
      "fallback"
    );
    expect(kind).toBe("correlationId");
    expect(value).toBe("corr-42");
  });

  it("falls back to the connection-based unique id last", () => {
    const { value, kind } = resolveRequesterFingerprint(ctx(), "conn-1");
    expect(kind).toBe("connection");
    expect(value).toBe("conn-1");
  });
});
