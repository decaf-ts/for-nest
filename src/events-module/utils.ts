export function normalizeEventResponse(args: any[]): unknown[] {
  const [modelConstr, operation, id, payload] = args;

  const modelName = modelConstr?.name ?? modelConstr;

  const serializedPayload = Array.isArray(payload)
    ? payload.map((e) => e.serialize())
    : payload?.serialize();

  return [modelName, operation, id, serializedPayload];
}
