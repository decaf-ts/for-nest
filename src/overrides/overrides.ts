import { Constructor, Metadata } from "@decaf-ts/decoration";
import { RequestToContextTransformer } from "../interceptors/context";
import { Adapter, ContextOf } from "@decaf-ts/core";

(Adapter as any).toContextFlags = function toContextFlags<
  A extends Adapter<any, any, any, any>,
>(adapter: A): Constructor<RequestToContextTransformer<ContextOf<A>>> {
  return Metadata["innerGet"]("transformers", adapter.alias);
}.bind(Adapter);
