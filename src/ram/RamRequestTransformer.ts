// @ts-expect-error only types. shouldnt matter
import { type RamContext, type RamFlags } from "@decaf-ts/core/ram";
import {
  requestToContextTransformer,
  RequestToContextTransformer,
} from "../interceptors/context";

@requestToContextTransformer("ram")
export class RamTransformer implements RequestToContextTransformer<RamContext> {
  async from(req: any): Promise<RamFlags> {
    const user = req.headers.authorization
      ? req.headers.authorization.split(" ")[1]
      : undefined;
    if (!user) {
      return {};
    }
    return {
      UUID: user,
    };
  }
}
