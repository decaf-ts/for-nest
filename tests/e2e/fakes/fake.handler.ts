import { DecafRequestHandler, DecafServerCtx } from "../../../src";

export class FakeHandler implements DecafRequestHandler {
  async handle(
    context: DecafServerCtx,
    req: Request,
    res: Response
  ): Promise<void> {
    const r = "fake-cert-" + req.body["id"];
    context.cache.put("context-works", {
      privateKey: "fake-private-key",
      publicKey: r,
    });
    // context.set("context-works", {
    //   privateKey: "fake-private-key",
    //   publicKey: r,
    // });
    (res as any).setHeader("x-decaf-cert", r);
  }
}
