import { Injectable } from "@nestjs/common";
import { matchesTopic } from "@decaf-ts/for-http/hooks/utils";
import { sanitizeTopics } from "./utils";

/**
 * @description A subscription record for a single requester fingerprint
 * @summary Captures the webhook-style topics a requester is subscribed to and the
 * last time that subscription was (re)registered. Topics follow the webhook syntax:
 * `<model>.*` (default) or the enhanced `<model>.<action|*>.<item id/pk>` form,
 * where `*` matches anything.
 * @typedef {Object} ObserverSubscriptionRecord
 * @property {string} fingerprint - The requester fingerprint this subscription belongs to
 * @property {string[]} topics - The webhook topics the requester is subscribed to
 * @property {Date} updatedAt - Timestamp of the last upsert for this subscription
 * @memberOf module:for-nest.events
 */
export type ObserverSubscriptionRecord = {
  fingerprint: string;
  topics: string[];
  updatedAt: Date;
};

/**
 * @description The claim a stream holds on its requester fingerprint
 * @summary Returned by {@link ObserverSubscriptionRegistry.claimConnection}. A newer
 * claim for the same fingerprint supersedes it; `release()` only frees the
 * fingerprint while the claim is still the current one.
 * @typedef {Object} ConnectionClaim
 * @property {string} fingerprint - The claimed requester fingerprint
 * @property {function(): boolean} isCurrent - Whether no newer claim superseded this one
 * @property {function(): boolean} release - Frees the fingerprint if still current; returns whether it did
 * @memberOf module:for-nest.events
 */
export type ConnectionClaim = {
  readonly fingerprint: string;
  isCurrent(): boolean;
  release(): boolean;
};

type ActiveConnection = {
  claim: ConnectionClaim;
  evict?: () => void;
};

/** records with no stream are dropped after this long (subscribe without connecting) */
const UNCONNECTED_RECORD_TTL_MS = 10 * 60 * 1000;

/**
 * @description Graph-agnostic registry for observer topic subscriptions
 * @summary Tracks which requester fingerprint is subscribed to which webhook-style
 * topics and keeps a single SSE stream per fingerprint: a new stream for a
 * fingerprint takes over (and ends) the previous one, as happens when a client
 * reconnects before the server noticed its previous connection dropped. Topics
 * follow the webhook syntax: `<model>.*` (default) or the enhanced
 * `<model>.<action|*>.<item id/pk>` form, matched with {@link matchesTopic}. The
 * registry is the server-side state backing the SSE {@link EventsController} and
 * {@link EventsSubscriptionController}.
 * @class ObserverSubscriptionRegistry
 * @memberOf module:for-nest.events
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Registry as ObserverSubscriptionRegistry
 *   Client->>Registry: upsert(fingerprint, topics)
 *   Registry-->>Client: record
 *   Client->>Registry: claimConnection(fingerprint, evict)
 *   Registry->>Registry: evict() the previous stream, if any
 *   Registry-->>Client: claim
 *   Client->>Registry: matches(fingerprint, eventTopic)
 *   Registry-->>Client: true/false
 *   Client->>Registry: claim.release()
 */
@Injectable()
export class ObserverSubscriptionRegistry {
  private readonly records = new Map<string, ObserverSubscriptionRecord>();

  private readonly connections = new Map<string, ActiveConnection>();

  /**
   * @description Creates or replaces the subscription record for a fingerprint
   * @summary Sanitizes the requested topics and stores them against the requester
   * fingerprint, stamping the record with the current time. Records of clients
   * that subscribed but never connected are pruned along the way.
   * @param {string} fingerprint - The requester fingerprint to upsert subscriptions for
   * @param {string[]} [topics=[]] - The requested webhook topics (sanitized on write)
   * @returns {ObserverSubscriptionRecord} The stored subscription record
   */
  upsert(
    fingerprint: string,
    topics: string[] = []
  ): ObserverSubscriptionRecord {
    this.pruneUnconnected();
    const record: ObserverSubscriptionRecord = {
      fingerprint,
      topics: sanitizeTopics(topics),
      updatedAt: new Date(),
    };
    this.records.set(fingerprint, record);
    return record;
  }

  /**
   * @description Removes the subscription record for a fingerprint
   * @summary Deletes the stored record (if any) and reports whether one was present.
   * @param {string} fingerprint - The requester fingerprint to remove
   * @returns {boolean} Whether a record existed for the fingerprint
   */
  remove(fingerprint: string): boolean {
    return this.records.delete(fingerprint);
  }

  /**
   * @description Returns the subscription record for a fingerprint
   * @summary Looks up the stored record, if any.
   * @param {string} fingerprint - The requester fingerprint to look up
   * @returns {ObserverSubscriptionRecord|undefined} The record, or undefined if none exists
   */
  get(fingerprint: string): ObserverSubscriptionRecord | undefined {
    return this.records.get(fingerprint);
  }

  /**
   * @description Returns the subscribed topics for a fingerprint
   * @summary Returns the stored topic list, or an empty array when the fingerprint
   * has no record.
   * @param {string} fingerprint - The requester fingerprint whose topics to return
   * @returns {string[]} The subscribed topics (possibly empty)
   */
  topicsFor(fingerprint: string): string[] {
    return this.records.get(fingerprint)?.topics ?? [];
  }

  /**
   * @description Checks whether a fingerprint's subscriptions match an event topic
   * @summary Returns true when the requester has at least one topic pattern that
   * matches the given event topic, using {@link matchesTopic}.
   * @param {string} fingerprint - The requester fingerprint to check
   * @param {string} eventTopic - The concrete `<model>.<action>.<id>` event topic
   * @returns {boolean} Whether any subscribed pattern matches the event topic
   */
  matches(fingerprint: string, eventTopic: string): boolean {
    const record = this.records.get(fingerprint);
    if (!record || !record.topics.length) return false;
    return record.topics.some((pattern) => matchesTopic(eventTopic, pattern));
  }

  /**
   * @description Claims the right to stream events to a client
   * @summary Registers the stream as the fingerprint's single connection. When
   * the fingerprint already holds one, the new claim supersedes it and the
   * previous stream's `evict` callback is invoked so it can end.
   * @param {string} fingerprint - The requester fingerprint to claim
   * @param {function(): void} [evict] - Ends this stream when a newer one takes over
   * @returns {ConnectionClaim|undefined} The claim, or undefined for an empty fingerprint
   */
  claimConnection(
    fingerprint: string,
    evict?: () => void
  ): ConnectionClaim | undefined {
    if (!fingerprint) return undefined;
    const claim: ConnectionClaim = {
      fingerprint,
      isCurrent: () => this.connections.get(fingerprint)?.claim === claim,
      release: () => {
        if (!claim.isCurrent()) return false;
        this.connections.delete(fingerprint);
        return true;
      },
    };
    const previous = this.connections.get(fingerprint);
    this.connections.set(fingerprint, { claim, evict });
    previous?.evict?.();
    return claim;
  }

  /**
   * @description Whether a fingerprint currently holds a stream
   * @param {string} fingerprint - The requester fingerprint to check
   * @returns {boolean} Whether a stream is connected for the fingerprint
   */
  hasConnection(fingerprint: string): boolean {
    return this.connections.has(fingerprint);
  }

  /**
   * @description Releases a fingerprint's connection
   * @summary Frees the fingerprint regardless of which stream holds it; streams
   * should prefer `claim.release()`, which cannot free a newer stream's claim.
   * @param {string} fingerprint - The requester fingerprint to release
   */
  releaseConnection(fingerprint: string): void {
    this.connections.delete(fingerprint);
  }

  private pruneUnconnected(now = Date.now()): void {
    for (const [fingerprint, record] of this.records) {
      if (this.connections.has(fingerprint)) continue;
      if (now - record.updatedAt.getTime() > UNCONNECTED_RECORD_TTL_MS)
        this.records.delete(fingerprint);
    }
  }
}
