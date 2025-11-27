import { Controller, Get } from "@nestjs/common";
import { DecafRequestContext } from "../../../src";

@Controller("test")
export class FakeController {
  value = Math.random().toString();

  constructor(private readonly decafContext: DecafRequestContext) {}

  @Get()
  async handle() {
    // const requestScopedContext =
    // await this.decafContext.resolve(DecafRequestContext);
    // await this.decafContext.resolve(DecafRequestContext);
    // const certs = requestScopedContext.get(DECAF_ADPTER_FOR_OPTIONS);
    // console.log("Certificados:", certs);

    return { value: this.value };
  }
}
