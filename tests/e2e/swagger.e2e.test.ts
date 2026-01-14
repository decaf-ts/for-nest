import { INestApplication } from "@nestjs/common";
import { HttpModelClient, HttpModelResponse } from "./fakes/server";
import { Product } from "./fakes/models/Product";
import { genStr } from "./fakes/index";
import { NestFactory } from "@nestjs/core";
import {
  DecafExceptionFilter,
  DecafModule,
  RamTransformer,
} from "../../src/index";
import { RamAdapter } from "@decaf-ts/core/ram";
import { getApp } from "./app";

const timeout = 600000;

jest.setTimeout(timeout);

describe.skip("swagger", () => {
  let app: INestApplication;
  let productHttpClient: HttpModelClient<Product>;

  const productCode = genStr(14);
  const batchNumber = `BATCH${genStr(3)}`;
  const productPayload = { productCode, batchNumber, name: "Product ABC" };
  const id = `${productCode}:${batchNumber}`;

  let created: HttpModelResponse<Product>;

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
