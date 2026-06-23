import { Metadata } from "@decaf-ts/decoration";

import { DECAF_EXPOSE } from "../../constants";

export function expose(...flavours: string[]) {
  return function expose(target: any) {
    Metadata.set(
      target,
      DECAF_EXPOSE,
      (flavours.length ? flavours : true) as any
    );
    return target;
  };
}
