import { jest } from "@jest/globals";
import { it } from "@decaf-ts/for-testing";
import { AUTH_HANDLER } from "../../src/auth/constants";

type ProviderLike = {
  provide: unknown;
  useFactory?: () => unknown;
  useClass?: unknown;
};

await jest.unstable_mockModule("../../src/auth/AuthInterceptor", () => ({
  AuthInterceptor: class {},
}));
await jest.unstable_mockModule("../../src/auth/AuthMiddleware", () => ({
  AuthMiddleware: class {},
}));
const { DecafAuthModule } = await import("../../src/auth/DecafAuthModule");

class FakeAuthHandler {
  public logAccess = false;
}

describe("DecafAuthModule logAccess wiring", () => {
  const findAuthProvider = (providers: unknown[]): ProviderLike | undefined =>
    (providers as ProviderLike[]).find((p) => p?.provide === AUTH_HANDLER);

  it("forRoot with logAccess: true wires a factory that sets logAccess", () => {
    const dyn = DecafAuthModule.forRoot({
      handler: FakeAuthHandler as any,
      logAccess: true,
    });
    const provider = findAuthProvider(dyn.providers ?? []);
    expect(provider).toBeDefined();
    expect(typeof provider?.useFactory).toBe("function");
    const handler = (provider?.useFactory as () => FakeAuthHandler)();
    expect(handler.logAccess).toBe(true);
  });

  it("forRoot without logAccess keeps the useClass provider and logAccess defaults to false", () => {
    const dyn = DecafAuthModule.forRoot({
      handler: FakeAuthHandler as any,
    });
    const provider = findAuthProvider(dyn.providers ?? []);
    expect(provider).toBeDefined();
    expect(provider?.useFactory).toBeUndefined();
    expect(provider?.useClass).toBe(FakeAuthHandler);
    expect(new FakeAuthHandler().logAccess).toBe(false);
  });

  it("forRoot with logAccess: false keeps the useClass provider", () => {
    const dyn = DecafAuthModule.forRoot({
      handler: FakeAuthHandler as any,
      logAccess: false,
    });
    const provider = findAuthProvider(dyn.providers ?? []);
    expect(provider?.useFactory).toBeUndefined();
    expect(provider?.useClass).toBe(FakeAuthHandler);
  });

  it("exports AUTH_HANDLER", () => {
    const dyn = DecafAuthModule.forRoot({ handler: FakeAuthHandler as any });
    expect(dyn.exports).toContain(AUTH_HANDLER);
  });
});
