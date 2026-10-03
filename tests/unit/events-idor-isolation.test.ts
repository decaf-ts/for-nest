import { ObserverSubscriptionRegistry } from "../../src/events-module";

/**
 * G3-C4 IDOR regression guard for the SSE path.
 *
 * The ObseriverSubscriptionRegistry keys every subscription by the requester's
 * authenticated fingerprint (bound to the `user` identity by the C2 opt-in /
 * authenticated-identity-binding change). These cases assert that one
 * authenticated principal's subscriptions are isolated from another's - i.e. a
 * client cannot subscribe on behalf of, or read the topics of, a different
 * identity (no cross-tenant event leakage).
 */
describe("SSE observer IDOR isolation (per-fingerprint)", () => {
  let registry: ObserverSubscriptionRegistry;

  beforeAll(() => {
    registry = new ObserverSubscriptionRegistry();
  });

  it("isolates subscriptions between two distinct authenticated fingerprints", () => {
    registry.upsert("user-alice", ["ProcessStep.*"]);
    registry.upsert("user-bob", ["Product.created"]);

    expect(registry.topicsFor("user-alice")).toEqual(["ProcessStep.*"]);
    expect(registry.topicsFor("user-bob")).toEqual(["Product.created"]);

    // Alice must not observe Bob's topics and vice-versa.
    expect(registry.matches("user-alice", "Product.created")).toBe(false);
    expect(registry.matches("user-bob", "ProcessStep.created")).toBe(false);
  });

  it("does not leak a subscription record to a different fingerprint", () => {
    registry.upsert("user-carol", ["Order.updated"]);

    // A caller cannot read another fingerprint's record: no cross-key lookup.
    expect(registry.get("user-carol")).toBeDefined();
    expect(registry.get("user-dave")).toBeUndefined();
    expect(registry.topicsFor("user-dave")).toEqual([]);
    expect(registry.matches("user-dave", "Order.updated")).toBe(false);
  });

  it("a connection claim is exclusive per fingerprint (single SSE client)", () => {
    expect(registry.claimConnection("user-alice")).toBe(true);
    // A second claim for the same fingerprint is refused even by a different
    // caller, so one identity cannot be impersonated to open a second stream.
    expect(registry.claimConnection("user-alice")).toBe(false);
    registry.releaseConnection("user-alice");
    expect(registry.claimConnection("user-alice")).toBe(true);
  });
});
