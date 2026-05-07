import {
  requestToContextTransformer,
  RequestToContextTransformer,
} from "../interceptors/context";

// @requestToContextTransformer("ram")
export class RamTransformer implements RequestToContextTransformer<any> {
  constructor() {}

  async from(req: any, ..._args: any[]): Promise<any> {
    const user = req.headers.authorization
      ? req.headers.authorization.split(" ")[1]
      : undefined;
    if (!user) {
      return {
        headers: req?.headers || {},
        overrides: {},
      };
    }
    return {
      UUID: user,
      headers: req?.headers || {},
      overrides: {},
    };
  }
}
