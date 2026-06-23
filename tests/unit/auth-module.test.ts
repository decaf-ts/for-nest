import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthInterceptor, DecafAuthModule } from "../../src/auth";

describe("DecafAuthModule", () => {
  it("registers AuthInterceptor globally when requested", () => {
    const mod = DecafAuthModule.forRoot({ global: true });

    expect(mod.global).toBe(true);
    expect(mod.providers).toEqual(
      expect.arrayContaining([
        AuthInterceptor,
        expect.objectContaining({ provide: APP_INTERCEPTOR }),
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
        (provider: any) => provider?.provide === APP_INTERCEPTOR
      )
    ).toBe(false);
  });
});
