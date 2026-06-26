import { DynamicModule, Module, Type } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthInterceptor } from "./AuthInterceptor";
import { AUTH_HANDLER } from "./constants";
import { AuthHandler } from "../types";

export type DecafAuthModuleOptions = {
  global?: boolean;
  handler?: Type<AuthHandler>;
};

@Module({})
export class DecafAuthModule {
  static forRoot(
    options: DecafAuthModuleOptions = {}
  ): DynamicModule {
    const providers: DynamicModule["providers"] = [
      AuthInterceptor,
    ];

    if (options.handler) {
      providers.push(options.handler);
      providers.push({
        provide: AUTH_HANDLER,
        useClass: options.handler,
      });
    }

    if (options.global) {
      (providers as any[]).push({
        provide: APP_INTERCEPTOR,
        useExisting: AuthInterceptor,
      });
    }

    return {
      module: DecafAuthModule,
      global: options.global ?? false,
      providers,
      exports: [AuthInterceptor, AUTH_HANDLER],
    };
  }
}
