import {
  apply,
  Decoration,
  Metadata,
  methodMetadata,
} from "@decaf-ts/decoration";
import { DECAF_ROUTE } from "./constants";

export interface RouteOptions {
  path: string;
  handler: PropertyDescriptor;
}

export function route(path: string) {
  const key = DECAF_ROUTE;
  function route() {
    return function route(obj: object, prop?: any, descriptor?: any) {
      const options: RouteOptions = {
        path: path,
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
