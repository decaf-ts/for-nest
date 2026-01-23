import { Injectable } from "@nestjs/common";
import { DecafRoleAuthHandler } from "../../../src/request/DecafAuthHandler";

@Injectable()
export class MockAuthHandler extends DecafRoleAuthHandler {
  constructor() {
    super();
  }
}
