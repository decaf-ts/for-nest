import { Logging } from "@decaf-ts/logging";

import { contextualizeRequestContext } from "../../src/request/contextualize";

describe("request contextualization", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("binds ip metadata once and preserves existing logger enrichment", () => {
    const forCalls: any[] = [];
    const baseLogger = {
      for(meta: Record<string, unknown>) {
        forCalls.push(meta);
        return this;
      },
      error: jest.fn(),
      debug: jest.fn(),
    };

    jest.spyOn(Logging, "get").mockReturnValue(baseLogger as any);

    const store: Record<string, unknown> = {};
    const requestContext = {
      getOrUndefined(key: string) {
        return store[key];
      },
      accumulate(value: Record<string, unknown>) {
        Object.assign(store, value);
        return requestContext;
      },
    } as any;

    const req = {
      method: "GET",
      url: "/secure",
      headers: {
        "x-forwarded-for": "10.0.0.1, 127.0.0.1",
      },
    };

    expect(contextualizeRequestContext(requestContext, req)).toBe(true);
    expect(forCalls).toEqual([{ ip: "10.0.0.1" }]);
    expect(store.operation).toBe("GET /secure");
    expect(store.timestamp).toBeInstanceOf(Date);
    expect(store.logger).toBe(baseLogger);

    expect(contextualizeRequestContext(requestContext, req)).toBe(false);
    expect(forCalls).toHaveLength(1);
  });
});
