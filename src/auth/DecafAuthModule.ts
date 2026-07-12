import { DynamicModule, MiddlewareConsumer, Module, NestModule, RequestMethod, Type } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AuthInterceptor } from "./AuthInterceptor";
import { AuthMiddleware } from "./AuthMiddleware";
import { AUTH_HANDLER } from "./constants";
import { AuthHandler } from "../types";

export type DecafAuthModuleOptions = {
  global?: boolean;
  handler?: Type<AuthHandler>;
};

@Module({})
export class DecafAuthModule implements NestModule {
  static forRoot(
    options: DecafAuthModuleOptions = {}
  ): DynamicModule {
    const providers: DynamicModule["providers"] = [
      AuthInterceptor,
      AuthMiddleware,
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
      exports: [AuthInterceptor, AuthMiddleware, AUTH_HANDLER],
    };
  }

  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthMiddleware).forRoutes({ path: "*", method: RequestMethod.ALL });
  }
}
