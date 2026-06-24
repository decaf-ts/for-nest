import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthInterceptor, DecafAuthModule } from "../../src/auth";
import { DecafRequestHandlerInterceptor } from "../../src/interceptors/DecafRequestHandlerInterceptor";

describe("DecafAuthModule", () => {
  it("registers AuthInterceptor globally when requested", () => {
    const mod = DecafAuthModule.forRoot({ global: true });

    expect(mod.global).toBe(true);
    expect(mod.providers).toEqual(
      expect.arrayContaining([
        AuthInterceptor,
        DecafRequestHandlerInterceptor,
        expect.objectContaining({ provide: APP_INTERCEPTOR, useExisting: AuthInterceptor }),
      ])
    );
    expect(mod.exports).toEqual(expect.arrayContaining([AuthInterceptor]));
  });

  it("keeps AuthInterceptor opt-in when not global", () => {
    const mod = DecafAuthModule.forRoot({ global: false });

    expect(mod.global).toBe(false);
    expect(mod.providers).toEqual(expect.arrayContaining([AuthInterceptor]));
    expect(
      (mod.providers ?? []).some(
        (provider: any) =>
          provider?.provide === APP_INTERCEPTOR &&
          provider?.useExisting === AuthInterceptor
      )
    ).toBe(false);
  });

  it("always ensures DecafRequestHandlerInterceptor as APP_INTERCEPTOR", () => {
    const mod = DecafAuthModule.forRoot({ global: false });

    expect(
      (mod.providers ?? []).some(
        (provider: any) =>
          provider?.provide === APP_INTERCEPTOR &&
          provider?.useClass === DecafRequestHandlerInterceptor
      )
    ).toBe(true);
  });

  it("accepts a handler option and registers it via AUTH_HANDLER", () => {
    class TestHandler {
      async authorize() {}
    }
    const mod = DecafAuthModule.forRoot({ handler: TestHandler as any });

    expect(
      (mod.providers ?? []).some(
        (provider: any) =>
          provider?.provide === "AUTH_HANDLER" ||
          (typeof provider?.provide === "symbol" &&
            provider?.provide.toString() === "Symbol(AUTH_HANDLER)")
      )
    ).toBe(true);
  });
});
