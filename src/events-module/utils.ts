import { Model } from "@decaf-ts/decorator-validation";

export function normalizeEventResponse(args: any[]): unknown[] {
  const [modelConstr, operation, id, payload] = args;

  const modelName = modelConstr?.name ?? modelConstr;

  const serializedPayload = Array.isArray(payload)
    ? payload.map((e) => {
        try {
          if (typeof e.serialize === "function") return e.serialize();

          console.warn(
            `Payload item for ${modelName} does not have serialize method and is an ${typeof e}, attempting to stringify directly. Item: ${e}`
          );
          return typeof e === "string" ? e : JSON.stringify(e);
        } catch (err: unknown) {
          console.warn(`Failed to serialize payload for ${modelName}: ${err}`);
          return undefined;
        }
      })
    : payload && typeof payload.serialize === "function"
      ? payload.serialize()
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload);

  console.debug(
    `Normalized event response for model ${modelName}, operation ${operation}, id ${id}:`,
    serializedPayload
  );

  return [modelName, operation, id, serializedPayload];
}
