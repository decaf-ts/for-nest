import "@decaf-ts/core";
import type { Constructor } from "@decaf-ts/decoration";
import { RequestToContextTransformer } from "../interceptors/context";
import { ContextOf } from "@decaf-ts/core";

declare module "@decaf-ts/core" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Adapter {
    function transformerFor<A extends Adapter<any, any, any, any>>(
      adapter: A | string
    ):
      | Constructor<RequestToContextTransformer<ContextOf<A>>>
      | RequestToContextTransformer<ContextOf<A>>;

    function flavoursToTransform(): string[] | undefined;
  }
  export interface Context {
    toResponse<RES = any>(res: RES): RES;
  }
}
