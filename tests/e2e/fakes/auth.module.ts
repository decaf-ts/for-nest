// auth.module.ts
import { Global, Module } from "@nestjs/common";
import { MockAuthHandler } from "./mockAuth";
import { AUTH_HANDLER } from "../../../src";
import { AuthInterceptor } from "../../../src/auth/AuthInterceptor";

@Global()
@Module({
  providers: [
    AuthInterceptor,
    MockAuthHandler,
    {
      provide: AUTH_HANDLER,
      useClass: MockAuthHandler,
    },
  ],
  exports: [AUTH_HANDLER, AuthInterceptor],
})
export class AuthModule {}
