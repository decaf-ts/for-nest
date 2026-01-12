import { Constructor, Metadata } from "@decaf-ts/decoration";
import { RequestToContextTransformer } from "../interceptors/context";
import { Adapter, ContextOf } from "@decaf-ts/core";

(Adapter as any).trnasformerFor = function toContextFlags<
  A extends Adapter<any, any, any, any>,
>(adapter: A | string): Constructor<RequestToContextTransformer<ContextOf<A>>> {
  const alias =
    typeof adapter === "string" ? adapter : (adapter.alias as string);
  return Metadata["innerGet"](Metadata.key("transformers", alias));
}.bind(Adapter);

(Adapter as any).flavoursToTransform = function requestTransformers():
  | string[]
  | undefined {
  const meta = Metadata["innerGet"]("transformers");
  if (!meta) return undefined;
  return Object.keys(meta);
}.bind(Adapter);
