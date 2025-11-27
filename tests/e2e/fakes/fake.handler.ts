import {
  DECAF_ADAPTER_OPTIONS,
  DecafRequestContext,
  DecafRequestHandler,
} from "../../../src";

export class FakeHandler implements DecafRequestHandler {
  async handle(
    context: DecafRequestContext,
    req: Request,
    res: Response
  ): Promise<void> {
    const r = "fake-cert-" + req.body["id"];
    context.set("context-works", {
      privateKey: "fake-private-key",
      publicKey: r,
    });
    (res as any).setHeader("x-decaf-cert", r);
  }
}
