/**
 * @description Server-sent events (SSE) module for for-nest
 * @summary Exposes the classes that expose Decaf's Observer pattern as a NestJS SSE
 * stream over HTTP: the {@link EventsController} and {@link EventsSubscriptionController}
 * request handlers, the {@link ObserverSubscriptionRegistry} that tracks topic
 * subscriptions per requester fingerprint, the {@link DecafStreamModule} that wires
 * them into a Nest application and the module-level {@link ObserverEventsOptions}.
 * @namespace events
 * @memberOf module:for-nest
 */
export * from "./EventsController";
export * from "./EventsSubscriptionController";
export * from "./DecafStreamModule";
export * from "./ObserverSubscriptionRegistry";
export * from "./constant";
