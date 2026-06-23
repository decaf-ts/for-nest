import { applyDecorators, SetMetadata, UseInterceptors } from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { Constructor } from "@decaf-ts/decoration";

import { AUTH_META_KEY } from "./constants";
import { AuthInterceptor } from "./AuthInterceptor";

export function Auth(model?: string | Constructor) {
  const resource = model
    ? typeof model === "string"
      ? model
      : model.name
    : undefined;
  const decs = [ApiBearerAuth(), UseInterceptors(AuthInterceptor)];
  if (resource) decs.push(SetMetadata(AUTH_META_KEY, resource));
  return applyDecorators(...decs);
}
