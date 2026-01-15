import { DecafServerCtx } from "../constants";
import { FlagsOf } from "@decaf-ts/core";
import { metadata, Metadata } from "@decaf-ts/decoration";

export abstract class RequestToContextTransformer<C extends DecafServerCtx> {
  abstract from(req: any, ...args: any[]): Promise<FlagsOf<C>>;
}

export function requestToContextTransformer(flavour: string) {
  return function requestToContextTransformer(original: any) {
    Metadata.set("transformers", flavour, original);
    if (typeof original === "function")
      return metadata("transformers", flavour)(original);
    return original;
  };
}
