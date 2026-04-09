import {
  RequestToContextTransformer,
  requestToContextTransformer,
} from "../../../src/index";

export class MockTransformer implements RequestToContextTransformer<any> {
  async from(req: any): Promise<any> {
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
