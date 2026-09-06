import { AUTH_HANDLER } from "../../src/auth/constants";

type ProviderLike = {
  provide: unknown;
  useFactory?: () => unknown;
  useClass?: unknown;
};

jest.doMock("../../src/auth/AuthInterceptor", () => ({}));
jest.doMock("../../src/auth/AuthMiddleware", () => ({}));
jest.doMock("../../src/types", () => ({ AuthHandler: class {} }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { DecafAuthModule } = require("../../src/auth/DecafAuthModule");

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
