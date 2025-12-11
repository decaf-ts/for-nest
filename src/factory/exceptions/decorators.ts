import { UseFilters } from "@nestjs/common";
import { DecafExceptionFilter } from "./DecafErrorFilter";

export function UseDecafFilter() {
  return UseFilters(new DecafExceptionFilter());
}
