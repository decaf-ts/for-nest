import {
  apply,
  Decoration,
  Metadata,
  methodMetadata,
} from "@decaf-ts/decoration";
import { DECAF_ROUTE } from "../../constants";
import type { HttpVerbs } from "./types";
import { DecafRouteDecOptions } from "./types";

export function route(httpMethod: HttpVerbs, path: string) {
  const key = DECAF_ROUTE;
  function route() {
    return function route(obj: object, prop?: any, descriptor?: any) {
      const options: DecafRouteDecOptions = {
        path: path,
        httpMethod: httpMethod,
        handler: descriptor,
      };

      return apply(methodMetadata(Metadata.key(key, prop), options))(
        obj,
        prop,
        descriptor
      );
    };
  }

  return Decoration.for(key)
    .define({
      decorator: route,
      args: [],
    })
    .apply();
}
