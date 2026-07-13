import { Injectable } from "@nestjs/common";

export type ObserverSubscriptionRecord = {
  subscriberId: string;
  topics: Set<string>;
  updatedAt: Date;
};

@Injectable()
export class ObserverSubscriptionRegistry {
  private readonly records = new Map<string, ObserverSubscriptionRecord>();

  upsert(subscriberId: string, topics: string[] = []): ObserverSubscriptionRecord {
    const record: ObserverSubscriptionRecord = {
      subscriberId,
      topics: new Set(topics.filter(Boolean)),
      updatedAt: new Date(),
    };
    this.records.set(subscriberId, record);
    return record;
  }

  remove(subscriberId: string): boolean {
    return this.records.delete(subscriberId);
  }

  get(subscriberId: string): ObserverSubscriptionRecord | undefined {
    return this.records.get(subscriberId);
  }

  topicsFor(subscriberId: string): string[] {
    return [...(this.records.get(subscriberId)?.topics ?? [])];
  }

  matches(subscriberId: string, topic: string): boolean {
    const record = this.records.get(subscriberId);
    if (!record) return false;
    if (!record.topics.size) return false;
    return record.topics.has(topic) || record.topics.has("*");
  }
}
