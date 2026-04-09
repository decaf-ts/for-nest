import { Model } from "@decaf-ts/decorator-validation";

export function normalizeEventResponse(args: any[]): unknown[] {
  const [modelConstr, operation, id, payload] = args;

  const modelName = modelConstr?.name ?? modelConstr;

  const serializedPayload = Array.isArray(payload)
    ? payload.map((e) => {
        try {
          if (e instanceof Model) return e.serialize();
          return typeof e === "string" ? e : JSON.stringify(e);
        } catch (err: unknown) {
          console.warn(`Failed to serialize payload for ${modelName}: ${err}`);
          return undefined;
        }
      })
    : payload && payload instanceof Model
      ? payload.serialize()
      : payload
        ? JSON.stringify(payload)
        : undefined;

  return [modelName, operation, id, serializedPayload];
}
