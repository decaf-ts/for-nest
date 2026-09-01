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
 * @description Graph-agnostic registry for observer topic subscriptions
 * @summary Tracks which requester fingerprint is subscribed to which webhook-style
 * topics and enforces a single SSE client per fingerprint. Topics follow the webhook
 * syntax: `<model>.*` (default) or the enhanced `<model>.<action|*>.<item id/pk>`
 * form, matched with {@link matchesTopic}. The registry is the server-side state
 * backing the SSE {@link EventsController} and {@link EventsSubscriptionController}.
 * @class ObserverSubscriptionRegistry
 * @memberOf module:for-nest.events
 * @mermaid
 * sequenceDiagram
 *   participant Client
 *   participant Registry as ObserverSubscriptionRegistry
 *   Client->>Registry: upsert(fingerprint, topics)
 *   Registry-->>Client: record
 *   Client->>Registry: claimConnection(fingerprint)
 *   Registry-->>Client: true (or false if already active)
 *   Client->>Registry: matches(fingerprint, eventTopic)
 *   Registry-->>Client: true/false
 *   Client->>Registry: releaseConnection(fingerprint)
 */
@Injectable()
export class ObserverSubscriptionRegistry {
  private readonly records = new Map<string, ObserverSubscriptionRecord>();

  private readonly activeFingerprints = new Set<string>();

  /**
   * @description Creates or replaces the subscription record for a fingerprint
   * @summary Sanitizes the requested topics and stores them against the requester
   * fingerprint, stamping the record with the current time.
   * @param {string} fingerprint - The requester fingerprint to upsert subscriptions for
   * @param {string[]} [topics=[]] - The requested webhook topics (sanitized on write)
   * @returns {ObserverSubscriptionRecord} The stored subscription record
   */
  upsert(
    fingerprint: string,
    topics: string[] = []
  ): ObserverSubscriptionRecord {
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
   * @summary Enforces a single SSE connection per fingerprint: claims succeed only
   * once per fingerprint and fail while a previous connection is still active.
   * @param {string} fingerprint - The requester fingerprint to claim
   * @returns {boolean} Whether the connection was claimed for this fingerprint
   */
  claimConnection(fingerprint: string): boolean {
    if (!fingerprint) return false;
    if (this.activeFingerprints.has(fingerprint)) return false;
    this.activeFingerprints.add(fingerprint);
    return true;
  }

  /**
   * @description Releases an active connection claim for a fingerprint
   * @summary Removes the fingerprint from the active set so a new SSE connection
   * can be claimed for it.
   * @param {string} fingerprint - The requester fingerprint to release
   */
  releaseConnection(fingerprint: string): void {
    this.activeFingerprints.delete(fingerprint);
  }
}
