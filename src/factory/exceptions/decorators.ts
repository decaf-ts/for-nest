import { UseFilters, UseInterceptors } from "@nestjs/common";
import { DecafExceptionFilter } from "./DecafErrorFilter";
import { DecafResponseInterceptor } from "../../request/index";

export function UseDecafFilter() {
  return UseFilters(new DecafExceptionFilter());
}

export function UseDecafHeaders() {
  return UseInterceptors(DecafResponseInterceptor);
}
