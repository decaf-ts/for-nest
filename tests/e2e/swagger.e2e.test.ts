import "../../src";
import { INestApplication } from "@nestjs/common";
import { HttpModelClient } from "./fakes/server";
import { FakePartner } from "./fakes/models/FakePartner";
console.log(FakePartner.name);
import { Product } from "./fakes/models/Product";
import { getApp } from "./app";

const timeout = 600000;

jest.setTimeout(timeout);

describe.skip("swagger test for api", () => {
  let app: INestApplication;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let productHttpClient: HttpModelClient<Product>;

  beforeAll(async () => {
    app = await getApp();

    productHttpClient = new HttpModelClient<Product>(
      app.getHttpServer(),
      Product
    );
    app.listen(3000);
  });

  afterAll(async () => {
    await app?.close();
  });

  it("waits for a fre minutes", async () => {
    await new Promise((resolve) => setTimeout(resolve, timeout));
    console.log("Waiting for a fre minutes");
  });
});
