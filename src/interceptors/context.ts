import { DecafServerContext } from "../constants";
import { FlagsOf } from "@decaf-ts/core";
import { metadata, Metadata } from "@decaf-ts/decoration";

export type RequestToContextFlagsTransformer<
  C extends DecafServerContext = DecafServerContext,
> = (req: any) => Promise<C>;

export abstract class RequestToContextTransformer<
  C extends DecafServerContext,
> {
  abstract from(req: any, ...args: any[]): Promise<FlagsOf<C>>;
}

export function requestToContextTransformer(flavour: string) {
  return function requestToContextTransformer(original: object) {
    return metadata(Metadata.key("transformers", flavour), original)(original);
  };
}
