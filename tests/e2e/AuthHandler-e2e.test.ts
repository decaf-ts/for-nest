import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DecafExceptionFilter, DecafModule } from "../../src";

import {
  RamFlavour,
  RamAdapter,
  RamContext,
  RamFlags,
  // @ts-expect-error  import from ram
} from "@decaf-ts/core/ram";

RamAdapter.decoration();
import { Adapter, AuthorizationError } from "@decaf-ts/core";
Adapter.setCurrent(RamFlavour);
import { AuthModule } from "./fakes/auth.module";
import { AuthHttpModelClient } from "./fakes/serverAuth";
import { genStr } from "./fakes/utils";
import { Fake } from "./fakes/models/FakePartner";
import { Product } from "./fakes/models/ProductAdmin";
import {
  RequestToContextTransformer,
  requestToContextTransformer,
} from "../../src/interceptors/context";

@requestToContextTransformer(RamFlavour)
class RamTransformer implements RequestToContextTransformer<RamContext> {
  async from(req: any): Promise<RamFlags> {
    const user = req.headers.authorization
      ? req.headers.authorization.split(" ")[1]
      : undefined;
    if (!user) throw new AuthorizationError("User not found in headers");
    return {
      UUID: user,
    };
  }
}

jest.setTimeout(180000);

describe("Authentication", () => {
  let app: INestApplication;
  let ProductHttpRequest: AuthHttpModelClient<Product>;
  let FakeHttpRequest: AuthHttpModelClient<Fake>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule,
        DecafModule.forRootAsync({
          // adapter: FabricClientAdapter as any,
          conf: [[RamAdapter, {}]], //config,
          autoControllers: true,
        }),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    const exceptions = [new DecafExceptionFilter()];
    app.useGlobalFilters(...exceptions);
    await app.init();

    ProductHttpRequest = new AuthHttpModelClient<Product>(
      app.getHttpServer(),
      Product
    );
    FakeHttpRequest = new AuthHttpModelClient<Fake>(app.getHttpServer(), Fake);
  });

  afterAll(async () => {
    await app.close();
  });
  describe("CREATE", () => {
    it("should CREATE a product", async () => {
      const productCode = genStr(14);
      const batchNumber = `BATCH${genStr(3)}`;
      const productPayload = { productCode, batchNumber, name: "Product ABC" };
      const id = `${productCode}:${batchNumber}`;

      const product = new Product(productPayload);

      // Sign using same secret as your app
      const token = "admin";
      const res = await ProductHttpRequest.post(product, token);

      expect(res.status).toEqual(201);
      expect(res.toJSON()).toMatchObject(productPayload);
      expect(new Product(productPayload).createdBy).toEqual("admin");
      expect(res.pk).toEqual(id);
    });

    it("should CREATE a product and fake ( diferent roles )", async () => {
      const productCode = genStr(14);
      const batchNumber = `BATCH${genStr(3)}`;
      const productPayload = { productCode, batchNumber, name: "Product 2" };
      const id = `${productCode}:${batchNumber}`;

      const product = new Product(productPayload);

      // Sign using same secret as your app
      const token = "admin";
      const res = await ProductHttpRequest.post(product, token);

      expect(res.status).toEqual(201);
      expect(res.toJSON()).toMatchObject(productPayload);
      expect(res.pk).toEqual(id);

      const fakeId = genStr(6);
      const fakePayload = { id: "00" + fakeId, name: "Fake ABC" };

      const fake = new Fake(fakePayload);

      // Sign using same secret as your app
      const token2 = "partner";
      const res2 = await FakeHttpRequest.post(fake, token2);

      expect(res2.status).toEqual(201);
      expect(res2.toJSON()).toMatchObject(fakePayload);
      expect(res2.pk).toEqual(fakeId);
    });

    it("should FAIL CREATE a product and fake ( diferent roles )", async () => {
      const productCode = genStr(14);
      const batchNumber = `BATCH${genStr(3)}`;
      const productPayload = { productCode, batchNumber, name: "Product 2" };

      const product = new Product(productPayload);

      // Sign using same secret as your app
      const token = "partner";
      const res = await ProductHttpRequest.post(product, token);

      expect(res.raw.error).toContain("Missing role: partner");

      const fakeId = genStr(6);
      const fakePayload = { id: fakeId, name: "Fake ABC" };

      const fake = new Fake(fakePayload);

      // Sign using same secret as your app
      const token2 = "admin";
      const res2 = await FakeHttpRequest.post(fake, token2);

      expect(res2.raw.error).toContain("Missing role: admin");
    });
  });
  describe("UPDATE", () => {
    const productCode = genStr(14);
    const batchNumber = `BATCH${genStr(3)}`;
    const productPayload = { productCode, batchNumber, name: "Product 2" };
    const id = `${productCode}:${batchNumber}`;

    const product = new Product(productPayload);

    const fakeId = genStr(6);
    const fakePayload = { id: fakeId, name: "Fake ABC" };

    const fake = new Fake(fakePayload);
    beforeAll(async () => {
      // Sign using same secret as your app
      const token = "admin";
      const res = await ProductHttpRequest.post(product, token);

      expect(res.status).toEqual(201);
      expect(res.toJSON()).toMatchObject(productPayload);
      expect(res.pk).toEqual(id);

      // Sign using same secret as your app
      const token2 = "partner";
      const res2 = await FakeHttpRequest.post(fake, token2);

      expect(res2.status).toEqual(201);
      expect(res2.toJSON()).toMatchObject(fakePayload);
      expect(res2.pk).toEqual(fakeId);
    });
    it("should UPDATE a product and fake ( diferent roles )", async () => {
      const token = "admin";
      const updatedRes = await ProductHttpRequest.put(
        { ...product, name: "updated name" },
        token,
        product.productCode,
        product.batchNumber
      );
      expect(updatedRes.status).toEqual(200);
      expect(updatedRes.toJSON()).toMatchObject({
        productCode,
        batchNumber,
        name: "updated name",
      });

      const token2 = "partner";
      const updatedRes2 = await FakeHttpRequest.put(
        { ...fake, name: "updated name" },
        token2,
        fake.id
      );
      expect(updatedRes2.status).toEqual(200);
      expect(updatedRes2.toJSON()).toMatchObject({
        name: "updated name",
      });
    });

    it("should FAIL UPDATE a product and fake ( diferent roles )", async () => {
      const token = "partner";
      const updatedRes = await ProductHttpRequest.put(
        { ...product, name: "updated name fail" },
        token,
        product.productCode,
        product.batchNumber
      );

      expect(updatedRes.raw.error).toContain("Missing role: partner");

      const token2 = "admin";
      const updatedRes2 = await FakeHttpRequest.put(
        { ...fake, name: "updated name fail" },
        token2,
        fake.id
      );

      expect(updatedRes2.raw.error).toContain("Missing role: admin");
    });
  });

  describe("READ", () => {
    const productCode = genStr(14);
    const batchNumber = `BATCH${genStr(3)}`;
    const productPayload = { productCode, batchNumber, name: "Product Read" };
    const product = new Product(productPayload);

    const fakeId = genStr(6);
    const fakePayload = { id: fakeId, name: "Fake Read" };
    const fake = new Fake(fakePayload);

    beforeAll(async () => {
      const adminToken = "admin";
      const productRes = await ProductHttpRequest.post(product, adminToken);

      expect(productRes.status).toEqual(201);
      expect(productRes.toJSON()).toMatchObject(productPayload);

      const partnerToken = "partner";
      const fakeRes = await FakeHttpRequest.post(fake, partnerToken);

      expect(fakeRes.status).toEqual(201);
      expect(fakeRes.toJSON()).toMatchObject(fakePayload);
    });

    it("should READ a product and fake ( diferent roles )", async () => {
      const token = "admin";
      const productRes = await ProductHttpRequest.get(
        token,
        product.productCode,
        product.batchNumber
      );

      expect(productRes.status).toEqual(200);
      expect(productRes.toJSON()).toMatchObject(productPayload);

      const token2 = "partner";
      const fakeRes = await FakeHttpRequest.get(token2, fake.id);

      expect(fakeRes.status).toEqual(200);
      expect(fakeRes.toJSON()).toMatchObject(fakePayload);
    });

    it("should FAIL READ a product and fake ( diferent roles )", async () => {
      const token = "partner";
      const productRes = await ProductHttpRequest.get(
        token,
        product.productCode,
        product.batchNumber
      );

      expect(productRes.raw.error).toContain("Missing role: partner");

      const token2 = "admin";
      const fakeRes = await FakeHttpRequest.get(token2, fake.id);

      expect(fakeRes.raw.error).toContain("Missing role: admin");
    });
  });

  describe("DELETE", () => {
    let product: Product;
    let fake: Fake;

    beforeEach(async () => {
      const productCode = genStr(14);
      const batchNumber = `BATCH${genStr(3)}`;
      const productPayload = {
        productCode,
        batchNumber,
        name: "Product Delete",
      };
      product = new Product(productPayload);

      const adminToken = "admin";
      const productRes = await ProductHttpRequest.post(product, adminToken);
      expect(productRes.status).toEqual(201);

      const fakePayload = { id: genStr(6), name: "Fake Delete" };
      fake = new Fake(fakePayload);

      const partnerToken = "partner";
      const fakeRes = await FakeHttpRequest.post(fake, partnerToken);
      expect(fakeRes.status).toEqual(201);
    });

    it("should DELETE a product and fake ( diferent roles )", async () => {
      const adminToken = "admin";
      const deleteProductRes = await ProductHttpRequest.delete(
        adminToken,
        product.productCode,
        product.batchNumber
      );

      expect(deleteProductRes.status).toEqual(200);

      const getDeletedProduct = await ProductHttpRequest.get(
        adminToken,
        product.productCode,
        product.batchNumber
      );

      expect(getDeletedProduct.raw.error).toContain(
        `[NotFoundError][404] Record with id ${product.productCode}:${product.batchNumber} not found in table product`
      );

      const partnerToken = "partner";
      const deleteFakeRes = await FakeHttpRequest.delete(partnerToken, fake.id);

      expect(deleteFakeRes.status).toEqual(200);

      const getDeletedFake = await FakeHttpRequest.get(partnerToken, fake.id);

      expect(getDeletedFake.raw.error).toEqual(
        `[NotFoundError] Record with id ${fake.id} not found in table fake`
      );
    });

    it("should FAIL DELETE a product and fake ( diferent roles )", async () => {
      const productRes = await ProductHttpRequest.delete(
        "partner",
        product.productCode,
        product.batchNumber
      );

      expect(productRes.raw.error).toContain("Missing role: partner");

      const fakeRes = await FakeHttpRequest.delete("admin", fake.id);

      expect(fakeRes.raw.error).toContain("Missing role: admin");
    });
  });
});
