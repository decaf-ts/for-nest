import { DynamicModule, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthInterceptor } from "./AuthInterceptor";

export type DecafAuthModuleOptions = {
  global?: boolean;
};

@Module({})
export class DecafAuthModule {
  static forRoot(
    options: DecafAuthModuleOptions = {}
  ): DynamicModule {
    const providers: DynamicModule["providers"] = [AuthInterceptor];
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
      exports: [AuthInterceptor],
    };
  }
}
