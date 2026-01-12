import { DecafServerContext } from "../constants";
import { FlagsOf } from "@decaf-ts/core";
import { Metadata } from "@decaf-ts/decoration";

export abstract class RequestToContextTransformer<
  C extends DecafServerContext,
> {
  abstract from(req: any, ...args: any[]): Promise<FlagsOf<C>>;
  abstract toAuth(ctx: C): Partial<FlagsOf<C>>;
}

export function requestToContextTransformer(flavour: string) {
  return function requestToContextTransformer(original: object) {
    Metadata.set("transformers", flavour, original);
    return original;
  };
}
