import { UseFilters, UseInterceptors } from "@nestjs/common";
import { DecafExceptionFilter } from "./DecafErrorFilter";
import { DecafResponseInterceptor } from "../../request/index";

// No ModuleRef available at decoration time, so this instance falls back to
// Logging.get() rather than the request-bound context logger; prefer
// NestBootstraper.useGlobalFilters() for context-aware error logging.
export function UseDecafFilter() {
  return UseFilters(new DecafExceptionFilter());
}

export function UseDecafHeaders() {
  return UseInterceptors(DecafResponseInterceptor);
}
