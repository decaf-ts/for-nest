import type { Constructor } from "@decaf-ts/decoration";
import { Logging } from "@decaf-ts/logging";

/**
 * @description Normalizes an observer refresh payload for SSE delivery
 * @summary Maps the raw observer arguments — model reference, operation, id and
 * payload — into a serializable tuple by resolving the model name and serializing
 * the payload(s). Array payloads are serialized element-wise, dropping elements
 * that cannot be serialized.
 * @param {any[]} args - The raw observer arguments `[model, operation, id, payload]`
 * @returns {unknown[]} The tuple `[modelName, operation, id, serializedPayload]`
 * @function normalizeEventResponse
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant normalize as normalizeEventResponse
 *   Caller->>normalize: args [model, operation, id, payload]
 *   normalize->>normalize: resolve modelName
 *   alt payload is an array
 *     normalize->>normalize: serialize each element
 *   else payload is serializable
 *     normalize->>normalize: payload.serialize()
 *   else
 *     normalize->>normalize: JSON.stringify(payload)
 *   end
 *   normalize-->>Caller: [modelName, operation, id, serializedPayload]
 * @memberOf module:for-nest.events
 */
export function normalizeEventResponse(args: any[]): unknown[] {
  const [modelConstr, operation, id, payload] = args;

  const modelName = modelConstr?.name ?? modelConstr;
  const log = Logging.for(normalizeEventResponse);

  const serializedPayload = Array.isArray(payload)
    ? payload.map((e) => {
        try {
          if (typeof e.serialize === "function") return e.serialize();

          log.verbose(
            `Payload item for ${modelName} has no serialize method (${typeof e}); stringifying it`
          );
          return typeof e === "string" ? e : JSON.stringify(e);
        } catch (err: unknown) {
          log.warn(`Failed to serialize payload for ${modelName}: ${err}`);
          return undefined;
        }
      })
    : payload && typeof payload.serialize === "function"
      ? payload.serialize()
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

  log.silly(
    `Normalized event response for model ${modelName}, operation ${operation}, id ${id}`
  );

  return [modelName, operation, id, serializedPayload];
}

/**
 * @description Resolves the name of a model
 * @summary Returns the model name when given a string, a class constructor (or an
 * instance thereof) or an object carrying a `name`/`constructor.name`.
 * @param {string|Constructor|object|undefined} model - The model to name
 * @returns {string} The model name, or an empty string when it cannot be resolved
 * @function nameOf
 * @memberOf module:for-nest.events
 */
export function nameOf(model: string | Constructor | object | undefined): string {
  if (typeof model === "string") return model;
  if (typeof model === "function" && model?.name) return model.name;
  if (typeof model === "object" && model) {
    const name = (model as any)?.name ?? (model as any)?.constructor?.name;
    return typeof name === "string" ? name : "";
  }
  return "";
}

/**
 * @description Builds the webhook topic for an observed event
 * @summary Builds the `<model>.<action>.<id>` topic consumed by the subscription
 * matcher, dropping the id segment when the id is an array, null or absent.
 * @param {string|Constructor|object|undefined} model - The model the event belongs to
 * @param {string} event - The operation key (e.g. `create`, `update`, `delete`)
 * @param {*} [id] - The event id; arrays are ignored
 * @returns {string} The string `<model>.<action>` or `<model>.<action>.<id>` topic
 * @function eventTopicFor
 * @memberOf module:for-nest.events
 */
export function eventTopicFor(
  model: string | Constructor | object | undefined,
  event: string,
  id?: any
): string {
  const modelName = nameOf(model);
  if (!modelName) return "";
  const segments = [modelName, event];
  if (id !== undefined && id !== null) {
    const scalar = Array.isArray(id) ? undefined : id;
    if (scalar !== undefined) segments.push(String(scalar));
  }
  return segments.filter(Boolean).join(".");
}

/**
 * @description Identity resolved for a requester for topic-scoped SSE
 * @summary Carries the value that identifies a requester (one SSE client), together
 * with how that value was resolved: an authenticated user's client (user scoped by
 * its `x-correlation-id`), an authenticated user without correlation id, the
 * `x-correlation-id` header alone, or a fallback connection id.
 * @typedef {Object} RequesterFingerprint
 * @property {string} value - The resolved fingerprint value
 * @property {'userClient'|'user'|'correlationId'|'connection'} kind - How the fingerprint was resolved
 * @memberOf module:for-nest.events
 */
export type RequesterFingerprint = {
  value: string;
  kind: "userClient" | "user" | "correlationId" | "connection";
};

/**
 * @description Builds a fingerprint value that cannot collide across kinds
 * @summary Prefixes the value with its kind and URI-encodes every part, so e.g. a
 * correlation id sent without credentials can never equal an authenticated
 * user's client fingerprint.
 * @param {string} kind - The fingerprint namespace (`user`, `cid` or `conn`)
 * @param {...string} parts - The identifying parts
 * @returns {string} The namespaced fingerprint
 * @function fingerprintOf
 * @memberOf module:for-nest.events
 */
export function fingerprintOf(kind: string, ...parts: string[]): string {
  return [kind, ...parts.map((part) => encodeURIComponent(part))].join(":");
}

/**
 * @description Extracts a fingerprint from an authenticated user identity
 * @summary Returns the identity itself when it is a non-empty string, or the value
 * of the `id`/`uuid`/`UUID`/`user` property when the identity is an object. Returns
 * undefined for null, numeric or unidentifiable identities.
 * @param {unknown} identity - The authenticated user identity
 * @returns {string|undefined} The user fingerprint, if resolvable
 * @function fingerprintOfUser
 * @memberOf module:for-nest.events
 */
export function fingerprintOfUser(identity: unknown): string | undefined {
  if (identity === undefined || identity === null) return undefined;
  if (typeof identity === "string") {
    return identity.trim() ? identity : undefined;
  }
  if (typeof identity === "object") {
    const candidate = (identity as Record<string, unknown>);
    const value =
      candidate["id"] ?? candidate["uuid"] ?? candidate["UUID"] ?? candidate["user"];
    if (typeof value === "string" && value.trim()) return value;
    return undefined;
  }
  return undefined;
}

/**
 * @description Stable, logged-safe prefix of a requester fingerprint
 * @summary Truncates a fingerprint to its first eight characters so logs never
 * leak the full identifier; returns `<none>` for empty input.
 * @param {string} fingerprint - The full requester fingerprint
 * @returns {string} The truncated label, or `<none>`
 * @function fingerprintLabel
 * @memberOf module:for-nest.events
 */
export function fingerprintLabel(fingerprint: string): string {
  if (!fingerprint) return "<none>";
  return fingerprint.length <= 8 ? fingerprint : `${fingerprint.slice(0, 8)}...`;
}

const MAX_TOPIC_LENGTH = 512;
const MAX_TOPIC_SEGMENTS = 8;

/**
 * @description Sanitizes a set of requested webhook topics
 * @summary Trims each topic, drops empty topics, topics longer than 512 characters,
 * topics with more than 8 dot-separated segments and duplicate entries.
 * @param {Iterable<string>} topics - The raw requested topics
 * @returns {string[]} The deduplicated, validated topics
 * @function sanitizeTopics
 * @memberOf module:for-nest.events
 */
export function sanitizeTopics(topics: Iterable<string>): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];
  for (const raw of topics ?? []) {
    const topic = (raw ?? "").trim();
    if (!topic || topic.length > MAX_TOPIC_LENGTH) continue;
    if (topic.split(".").length > MAX_TOPIC_SEGMENTS) continue;
    if (seen.has(topic)) continue;
    seen.add(topic);
    sanitized.push(topic);
  }
  return sanitized;
}

/**
 * @description Resolves the requester fingerprint for an incoming request
 * @summary Identifies the SSE client behind a request. An authenticated user's
 * client is `user:<user>:<x-correlation-id>` — several tabs/devices of one user
 * are distinct clients, while the user part keeps another user from acting on
 * them by replaying their correlation id. Without a correlation id the user alone
 * is used (`user:<user>`); without a user, the header (`cid:<id>`); and finally
 * the supplied fallback (typically a freshly generated id) as `conn:<id>`. Parts
 * are URI-encoded, so fingerprints of different kinds never collide.
 * @param {Object} context - The request context used for resolution
 * @param {function(string): unknown} [context.getOrUndefined] - Context lookup keyed by name (e.g. `user`)
 * @param {Object} [context.headers] - Raw request headers
 * @param {string} fallback - Fallback value when no identity nor correlation header exists
 * @returns {RequesterFingerprint} The resolved fingerprint, with its resolution kind
 * @function resolveRequesterFingerprint
 * @mermaid
 * sequenceDiagram
 *   participant Caller
 *   participant resolve as resolveRequesterFingerprint
 *   Caller->>resolve: context, fallback
 *   alt authenticated user and x-correlation-id
 *     resolve-->>Caller: { kind: userClient, value: user:<user>:<correlationId> }
 *   else authenticated user
 *     resolve-->>Caller: { kind: user }
 *   else x-correlation-id header present
 *     resolve-->>Caller: { kind: correlationId }
 *   else
 *     resolve-->>Caller: { kind: connection, value: fallback }
 *   end
 * @memberOf module:for-nest.events
 */
export function resolveRequesterFingerprint(
  context: {
    getOrUndefined?: (key: string) => unknown;
    headers?: Record<string, string | string[] | undefined> | undefined;
  },
  fallback: string
): RequesterFingerprint {
  const rawHeaders = context.headers ?? {};
  const header = rawHeaders["x-correlation-id"] ?? rawHeaders["X-Correlation-ID"];
  const correlationId = (Array.isArray(header) ? header[0] : header)?.trim();

  const authenticated = context.getOrUndefined?.("user");
  const userFingerprint = fingerprintOfUser(authenticated);
  if (userFingerprint) {
    return correlationId
      ? {
          value: fingerprintOf("user", userFingerprint, correlationId),
          kind: "userClient",
        }
      : { value: fingerprintOf("user", userFingerprint), kind: "user" };
  }

  if (correlationId) {
    return { value: fingerprintOf("cid", correlationId), kind: "correlationId" };
  }

  return { value: fingerprintOf("conn", fallback), kind: "connection" };
}
