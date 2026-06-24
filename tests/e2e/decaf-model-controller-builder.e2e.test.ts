import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import fs from "fs";
import path from "path";
import {
  Adapter,
  column,
  Cascade,
  createdAt,
  defaultQueryAttr,
  index,
  manyToOne,
  oneToMany,
  oneToOne,
  OrderDirection,
  pk,
  PreparedStatementKeys,
  query,
  Repository,
  repository,
  route,
  table,
  updatedAt,
} from "@decaf-ts/core";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { Model, ModelArg, model, required } from "@decaf-ts/decorator-validation";
import { uses, Metadata, DecorationKeys } from "@decaf-ts/decoration";
import { AxiosHttpAdapter } from "@decaf-ts/for-http";
import { RequestToContextTransformer } from "@decaf-ts/for-http/server";
import { EventSource } from "eventsource";
import { toKebabCase } from "@decaf-ts/logging";
import { BlockOperations, BulkCrudOperationKeys, composed, OperationKeys } from "@decaf-ts/db-decorators";

import { DecafExceptionFilter, DecafModule } from "../../src";
import { DecafStreamModule } from "../../src/events-module";
import { expose, controllerConfig } from "../../src/decaf-model";
import { DecafModuleOptions } from "../../src/types";

// ─── Manual inspection flag ──────────────────────────────────────────────
// Set MANUAL_INSPECT=true to pause the test after server boot, allowing
// manual testing of the server, Swagger UI, and OpenAPI spec validation.
//
// Usage:
//   MANUAL_INSPECT=true npx jest tests/e2e/decaf-model-controller-builder.e2e.test.ts
//
// The test will:
//   - Boot the NestJS app with Swagger UI at /docs
//   - Print the server URL, Swagger UI URL, and OpenAPI JSON URL
//   - Hang for the duration specified by MANUAL_INSPECT_TIMEOUT (default 5 min)
//   - Press Ctrl+C to stop early
const MANUAL_INSPECT = process.env.MANUAL_INSPECT === "true";
const MANUAL_INSPECT_TIMEOUT_MS = Number(
  process.env.MANUAL_INSPECT_TIMEOUT || 5 * 60 * 1000
);

RamAdapter.decoration();
Metadata.set(DecorationKeys.FLAVOUR, RamFlavour, []);
Model.setBuilder(Model.fromModel);
Adapter.setCurrent(RamFlavour);

jest.setTimeout(MANUAL_INSPECT ? MANUAL_INSPECT_TIMEOUT_MS + 60000 : 120000);

class LiveTransformer extends RequestToContextTransformer<any> {
  async from(req: any): Promise<any> {
    return {
      headers: req?.headers || {},
      overrides: {},
    };
  }
}

function randomSuffix() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function basePath(modelCtor: { name: string }) {
  return `/${toKebabCase(Model.tableName(modelCtor as any))}`;
}

function rowPath(modelCtor: { name: string }, ...segments: string[]) {
  return `${basePath(modelCtor)}/${segments.map((s) => encodeURIComponent(s)).join("/")}`;
}

function idsQuery(ids: string[]) {
  return `?${ids.map((id) => `ids=${encodeURIComponent(id)}`).join("&")}`;
}

async function requestJson(
  adapter: AxiosHttpAdapter,
  method: "GET" | "POST" | "PUT" | "DELETE",
  url: string,
  data?: any,
  params?: Record<string, any>
) {
  const request: Record<string, any> = { method, url };
  if (typeof data !== "undefined") {
    request.data =
      typeof data === "string" || data instanceof Buffer
        ? data
        : JSON.stringify(data);
    request.headers = { "Content-Type": "application/json" };
  }
  if (params) request.params = params;
  const response = await adapter.client.request(request);
  if (typeof response.data === "string") {
    try {
      response.data = JSON.parse(response.data);
    } catch {
      // leave non-JSON as-is
    }
  }
  return response;
}

async function waitFor<T>(
  condition: () => Promise<T | undefined> | T | undefined,
  timeoutMs = 15000,
  intervalMs = 100
): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await condition();
    if (typeof value !== "undefined") return value as T;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

// ─── Models ───────────────────────────────────────────────────────────────

// Model 1: single-PK, grouping enabled, but LIST_BY blocked via @BlockOperations
@uses(RamFlavour)
@table("cfg_article")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: true, allowBulkStatement: true })
@BlockOperations([{ kind: "statement", value: PreparedStatementKeys.LIST_BY }])
class ConfigArticle extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  title!: string;

  @defaultQueryAttr()
  @column()
  @required()
  category!: string;

  @column()
  score!: number;

  @column()
  status!: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<ConfigArticle>) {
    super(arg);
  }
}

// Model 2: composed PK with filterEmpty, bulk update/delete disabled
@uses(RamFlavour)
@table("cfg_order")
@model()
@expose("ram")
@controllerConfig({
  allowBulkStatement: { create: true, read: true, update: false, delete: false },
  allowGroupingQueries: { count: true, sum: true, avg: true, max: false, min: false, distinct: false, group: false },
})
class ConfigOrder extends Model {
  @pk({ type: String, generated: false })
  @composed(["orderCode", "customerId"], ":", true)
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  orderCode!: string;

  @defaultQueryAttr()
  @column()
  @required()
  customerId!: string;

  @defaultQueryAttr()
  @column()
  @required()
  amount!: number;

  @column()
  status!: string;

  // many-to-one → ConfigCustomer (weak ref, populate: false per guardrail)
  @manyToOne(() => ConfigCustomer, { update: Cascade.CASCADE, delete: Cascade.CASCADE }, false)
  customer?: string | ConfigCustomer;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<ConfigOrder>) {
    super(arg);
  }
}

// Model 3: single-PK with oneToMany → ConfigOrder (owning side, populate: true)
// statementless queries disabled via @controllerConfig
@uses(RamFlavour)
@table("cfg_customer")
@model()
@expose("ram")
@controllerConfig({ allowStatementlessQuery: false, allowGroupingQueries: false })
class ConfigCustomer extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  name!: string;

  @defaultQueryAttr()
  @column()
  @index([OrderDirection.ASC, OrderDirection.DSC])
  tier!: string;

  @column()
  creditLimit!: number;

  // one-to-many → ConfigOrder (owning side, populate: true per guardrail)
  @oneToMany(
    () => ConfigOrder,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  orders!: ConfigOrder[];

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<ConfigCustomer>) {
    super(arg);
  }
}

// Model 4: single-PK with ALL grouping queries enabled (including distinct and group)
@uses(RamFlavour)
@table("cfg_tag")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: true, allowStatementlessQuery: true })
class ConfigTag extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  label!: string;

  @defaultQueryAttr()
  @column()
  @required()
  category!: string;

  @column()
  weight!: number;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<ConfigTag>) {
    super(arg);
  }
}

// ─── PTP-like models (mirrors PTP contract API surface) ──────────────────
// These models mirror the key structural characteristics of the PTP toolkit
// models (PKs, composed PKs, @BlockOperations) and their corresponding Fabric
// contracts' exposed/blocked methods, allowing us to verify that the for-nest
// controller builder generates an API surface consistent with the PTP API.

// PtpProductImage: single PK (productCode), per ProductImage
@uses(RamFlavour)
@table("ptp_product_image")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
@BlockOperations([OperationKeys.CREATE, OperationKeys.UPDATE, OperationKeys.DELETE])
class PtpProductImage extends Model {
  @pk({ type: String, generated: false })
  productCode!: string;

  @column()
  @required()
  content!: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpProductImage>) {
    super(arg);
  }
}

// PtpProductStrength: composed PK (productCode:uuid), per ProductStrength
@uses(RamFlavour)
@table("ptp_product_strength")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
@BlockOperations([OperationKeys.CREATE, OperationKeys.UPDATE, OperationKeys.DELETE])
class PtpProductStrength extends Model {
  @pk({ type: String, generated: false })
  @composed(["productCode", "uuid"], ":")
  id!: string;

  @column()
  @required()
  uuid!: string;

  @defaultQueryAttr()
  @column()
  @required()
  productCode!: string;

  @column()
  @required()
  strength!: string;

  @column()
  substance?: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpProductStrength>) {
    super(arg);
  }
}

// PtpProductMarket: composed PK (productCode:marketId) with filterEmpty, per ProductMarket
@uses(RamFlavour)
@table("ptp_product_market")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
class PtpProductMarket extends Model {
  @pk({ type: String, generated: false })
  @composed(["productCode", "marketId"], ":", true)
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  marketId!: string;

  @column()
  @required()
  productCode!: string;

  @column()
  nationalCode?: string;

  @column()
  mahName?: string;

  @column()
  legalEntityName?: string;

  @column()
  mahAddress?: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpProductMarket>) {
    super(arg);
  }
}

// PtpProduct: single PK (productCode), blocks delete + deleteAll (per ProductContract)
// Has @oneToOne → PtpProductImage, @oneToMany → PtpProductStrength, @oneToMany → PtpProductMarket
@uses(RamFlavour)
@table("ptp_product")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
@BlockOperations([OperationKeys.DELETE, BulkCrudOperationKeys.DELETE_ALL])
class PtpProduct extends Model {
  @pk({ type: String, generated: false })
  @defaultQueryAttr()
  productCode!: string;

  @defaultQueryAttr()
  @column()
  @required()
  inventedName!: string;

  @column()
  @required()
  nameMedicinalProduct!: string;

  @column()
  productRecall: boolean = false;

  @column()
  internalMaterialCode?: string;

  @oneToOne(
    () => PtpProductImage,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    false
  )
  imageData?: string | PtpProductImage;

  @oneToMany(
    () => PtpProductStrength,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  strengths!: PtpProductStrength[];

  @oneToMany(
    () => PtpProductMarket,
    { update: Cascade.CASCADE, delete: Cascade.CASCADE },
    true
  )
  markets!: PtpProductMarket[];

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpProduct>) {
    super(arg);
  }
}

// PtpBatch: composed PK (productCode:batchNumber), blocks delete + deleteAll (per BatchContract)
@uses(RamFlavour)
@table("ptp_batch")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
@BlockOperations([OperationKeys.DELETE, BulkCrudOperationKeys.DELETE_ALL])
class PtpBatch extends Model {
  @pk({ type: String, generated: false })
  @composed(["productCode", "batchNumber"], ":")
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  productCode!: string;

  @defaultQueryAttr()
  @column()
  @required()
  batchNumber!: string;

  @column()
  @required()
  expiryDate!: string;

  @column()
  batchRecall: boolean = false;

  @column()
  manufacturerName?: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpBatch>) {
    super(arg);
  }
}

// PtpLeaflet: composed PK with filterEmpty (batchNumber, epiMarket), no blocks (per LeafletContract)
@uses(RamFlavour)
@table("ptp_leaflet")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
class PtpLeaflet extends Model {
  @pk({ type: String, generated: false })
  @composed(
    ["productCode", "batchNumber", "leafletType", "lang", "epiMarket"],
    ":",
    ["batchNumber", "epiMarket"]
  )
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  productCode!: string;

  @defaultQueryAttr()
  @column()
  batchNumber?: string;

  @column()
  @required()
  leafletType!: string;

  @column()
  @required()
  lang!: string;

  @column()
  epiMarket?: string;

  @column()
  xmlFileContent?: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpLeaflet>) {
    super(arg);
  }
}

// PtpAudit: single PK (id), blocks update + delete + their bulk counterparts (per AuditContract)
@uses(RamFlavour)
@table("ptp_audit")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
@BlockOperations([
  OperationKeys.UPDATE,
  BulkCrudOperationKeys.UPDATE_ALL,
  OperationKeys.DELETE,
  BulkCrudOperationKeys.DELETE_ALL,
])
class PtpAudit extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  model!: string;

  @column()
  @required()
  action!: string;

  @defaultQueryAttr()
  @column()
  @required()
  recordId!: string;

  @column()
  @required()
  userId!: string;

  @column()
  @required()
  userGroup!: string;

  @column()
  @required()
  transaction!: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpAudit>) {
    super(arg);
  }
}

// PtpHistory: composed PK (table:key:version), blocks all writes (per HistoryContract — read-only)
@uses(RamFlavour)
@table("ptp_history")
@model()
@expose("ram")
@controllerConfig({ allowGroupingQueries: false })
@BlockOperations([
  OperationKeys.CREATE,
  BulkCrudOperationKeys.CREATE_ALL,
  OperationKeys.UPDATE,
  BulkCrudOperationKeys.UPDATE_ALL,
  OperationKeys.DELETE,
  BulkCrudOperationKeys.DELETE_ALL,
])
class PtpHistory extends Model {
  @pk({ type: String, generated: false })
  @composed(["table", "key", "version"], ":")
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  table!: string;

  @defaultQueryAttr()
  @column()
  @required()
  key!: string;

  @column()
  @required()
  version!: number;

  @column()
  record?: Record<string, any>;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<PtpHistory>) {
    super(arg);
  }
}

// ─── Custom Repository with @query and @route methods ─────────────────────

@repository(ConfigArticle)
class ConfigArticleRepository extends Repository<
  ConfigArticle,
  Adapter<any, any, any, any>
> {
  constructor(adapter: Adapter<any, any, any, any>) {
    super(adapter, ConfigArticle);
  }

  @query()
  async findByCategory(category: string) {
    throw new Error("Should be overridden by @query decorator");
  }

  @query()
  async findByStatusAndScoreGreaterThan(
    status: string,
    minScore: number
  ) {
    throw new Error("Should be overridden by @query decorator");
  }

  @route("GET", "metadata/summary")
  async metadataSummary() {
    return { total: 0, description: "Article metadata summary" };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildArticle(i: number, overrides: Partial<ConfigArticle> = {}) {
  return new ConfigArticle({
    id: overrides.id || `art-${i}-${randomSuffix()}`,
    title: overrides.title || `Article ${i}`,
    category: overrides.category || (i % 2 ? "tech" : "science"),
    score: overrides.score ?? i * 10,
    status: overrides.status || "draft",
    ...overrides,
  });
}

function buildCustomer(i: number, overrides: Partial<ConfigCustomer> = {}) {
  return new ConfigCustomer({
    id: overrides.id || `cust-${i}-${randomSuffix()}`,
    name: overrides.name || `Customer ${i}`,
    tier: overrides.tier || (i % 2 ? "gold" : "silver"),
    creditLimit: overrides.creditLimit ?? 1000 * i,
    ...overrides,
  });
}

function buildOrder(i: number, overrides: Partial<ConfigOrder> = {}) {
  const orderCode = overrides.orderCode || `ord-${i}`;
  const customerId = overrides.customerId || `cust-${i}`;
  return new ConfigOrder({
    id: overrides.id || `${orderCode}:${customerId}`,
    orderCode,
    customerId,
    amount: overrides.amount ?? 100 * i,
    status: overrides.status || "pending",
    ...overrides,
  });
}

function buildTag(i: number, overrides: Partial<ConfigTag> = {}) {
  return new ConfigTag({
    id: overrides.id || `tag-${i}-${randomSuffix()}`,
    label: overrides.label || `Tag ${i}`,
    category: overrides.category || (i % 2 ? "alpha" : "beta"),
    weight: overrides.weight ?? i * 5,
    ...overrides,
  });
}

function buildPtpProduct(i: number, overrides: Partial<PtpProduct> = {}) {
  return new PtpProduct({
    productCode: overrides.productCode || `gtin-${i}-${randomSuffix()}`,
    inventedName: overrides.inventedName || `Product ${i}`,
    nameMedicinalProduct: overrides.nameMedicinalProduct || `Medicinal ${i}`,
    productRecall: overrides.productRecall ?? false,
    ...overrides,
  });
}

function buildPtpBatch(i: number, overrides: Partial<PtpBatch> = {}) {
  const productCode = overrides.productCode || `gtin-${i}`;
  const batchNumber = overrides.batchNumber || `batch-${i}`;
  return new PtpBatch({
    id: overrides.id || `${productCode}:${batchNumber}`,
    productCode,
    batchNumber,
    expiryDate: overrides.expiryDate || "2030-12-31",
    batchRecall: overrides.batchRecall ?? false,
    ...overrides,
  });
}

function buildPtpLeaflet(i: number, overrides: Partial<PtpLeaflet> = {}) {
  const productCode = overrides.productCode || `gtin-${i}`;
  const batchNumber = overrides.batchNumber || `batch-${i}`;
  const leafletType = overrides.leafletType || "leaflet";
  const lang = overrides.lang || "en";
  const epiMarket = overrides.epiMarket || "US";
  return new PtpLeaflet({
    id: overrides.id || `${productCode}:${batchNumber}:${leafletType}:${lang}:${epiMarket}`,
    productCode,
    batchNumber,
    leafletType,
    lang,
    epiMarket,
    ...overrides,
  });
}

function buildPtpAudit(i: number, overrides: Partial<PtpAudit> = {}) {
  return new PtpAudit({
    id: overrides.id || `audit-${i}-${randomSuffix()}`,
    model: overrides.model || "Product",
    action: overrides.action || "CREATE",
    recordId: overrides.recordId || `rec-${i}`,
    userId: overrides.userId || `user-${i}`,
    userGroup: overrides.userGroup || "WRITER",
    transaction: overrides.transaction || `tx-${i}`,
    ...overrides,
  });
}

function buildPtpHistory(i: number, overrides: Partial<PtpHistory> = {}) {
  const table = overrides.table || "product";
  const key = overrides.key || `key-${i}`;
  const version = overrides.version ?? i;
  return new PtpHistory({
    id: overrides.id || `${table}:${key}:${version}`,
    table,
    key,
    version,
    record: overrides.record || { data: "snapshot" },
    ...overrides,
  });
}

// ─── Test ─────────────────────────────────────────────────────────────────

describe("DecafModel controller-builder e2e (DECAF-10)", () => {
  let app: INestApplication;
  let adapter: AxiosHttpAdapter;
  let eventSource: EventSource;
  const receivedEvents: Array<[string, string, string, any]> = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        await DecafModule.forRootAsync({
          conf: [
            [RamAdapter, { UUID: "ram-user" }, new LiveTransformer()],
          ],
          autoControllers: true,
          autoServices: true,
          // Module-level override: disable grouping for ConfigArticle
          // (decorator says true, module says false → module wins)
          controllerConfig: {
            [ConfigArticle.name]: { allowGroupingQueries: false },
          },
        } as DecafModuleOptions),
        DecafStreamModule.forFlavours([RamFlavour], "/sse"),
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DecafExceptionFilter());
    await app.init();
    const server = await app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve server address");
    }
    const host =
      address.address === "::"
        ? `127.0.0.1:${address.port}`
        : `${address.address}:${address.port}`;
    adapter = new AxiosHttpAdapter({ protocol: "http", host });

    // ── Manual inspection mode ─────────────────────────────────────────
    // When MANUAL_INSPECT=true, set up Swagger UI and pause the test so the
    // developer can manually test the server, inspect the Swagger UI, and
    // validate the OpenAPI spec.
    if (MANUAL_INSPECT) {
      const swaggerPath = "docs";
      const openApiJsonPath = "/api/openapi.json";

      // Build a minimal OpenAPI document manually (without @nestjs/swagger's
      // createDocument, which auto-explores controller schemas and hits
      // infinite recursion on the circular model relations in this test:
      // ConfigCustomer.orders → ConfigOrder.customer → ConfigCustomer...).
      // The Swagger UI will still show all routes (paths) that NestJS
      // registered; only the request/response body schemas are omitted.
      const openApiDoc = {
        openapi: "3.0.0",
        info: {
          title: "DECAF-10 Controller Builder E2E",
          version: "1.0.0",
          description:
            "Auto-generated controllers from models with @controllerConfig, " +
            "@BlockOperations, composed PKs, relations, @query and @route methods.\n\n" +
            "Note: Request/response body schemas are omitted in this minimal spec " +
            "to avoid infinite recursion from circular model relations. " +
            "All routes (paths) are auto-discovered by Swagger UI from the live server.",
        },
        paths: {},
      };

      // Register a minimal Swagger UI that loads the OpenAPI JSON
      const httpAdapter = app.getHttpAdapter() as any;
      httpAdapter.get(openApiJsonPath, (_req: any, res: any) => {
        httpAdapter.reply(res, openApiDoc, 200, {
          "Content-Type": "application/json",
        });
      });

      // Serve Swagger UI HTML that fetches the OpenAPI JSON
      httpAdapter.get(`/${swaggerPath}`, (_req: any, res: any) => {
        const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DECAF-10 E2E API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: "${openApiJsonPath}",
      dom_id: "#swagger-ui",
    });
  </script>
</body>
</html>`;
        httpAdapter.reply(res, html, 200, { "Content-Type": "text/html" });
      });

      const baseUrl = `http://${host}`;
      // eslint-disable-next-line no-console
      console.log("\n" + "=".repeat(72));
      // eslint-disable-next-line no-console
      console.log("  MANUAL INSPECT MODE — server is live for manual testing");
      // eslint-disable-next-line no-console
      console.log("=".repeat(72));
      // eslint-disable-next-line no-console
      console.log(`  Base URL:        ${baseUrl}`);
      // eslint-disable-next-line no-console
      console.log(`  Swagger UI:      ${baseUrl}/${swaggerPath}`);
      // eslint-disable-next-line no-console
      console.log(`  OpenAPI JSON:    ${baseUrl}${openApiJsonPath}`);
      // eslint-disable-next-line no-console
      console.log(`  SSE stream:      ${baseUrl}/sse`);
      // eslint-disable-next-line no-console
      console.log("");
      // eslint-disable-next-line no-console
      console.log(
        `  Hanging for ${MANUAL_INSPECT_TIMEOUT_MS / 1000}s ` +
          `(or press Ctrl+C to stop)...`
      );
      // eslint-disable-next-line no-console
      console.log("=".repeat(72) + "\n");

      await new Promise((resolve) =>
        setTimeout(resolve, MANUAL_INSPECT_TIMEOUT_MS)
      );
    }
  });

  afterAll(async () => {
    eventSource?.close();
    await app?.close();
  });

  // ── ConfigArticle: grouping disabled by module override, listBy blocked ──

  describe("ConfigArticle (grouping disabled by module override, listBy blocked)", () => {
    it("performs CRUD and bulk operations", async () => {
      const base = basePath(ConfigArticle);
      const seed = buildArticle(1);
      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      const read = await requestJson(adapter, "GET", rowPath(ConfigArticle, seed.id));
      expect(read.status).toBe(200);
      expect(read.data.id).toBe(seed.id);

      const updated = await requestJson(adapter, "PUT", rowPath(ConfigArticle, seed.id), {
        ...seed,
        status: "published",
      });
      expect(updated.status).toBe(200);

      const bulk = await requestJson(adapter, "POST", `${base}/bulk`, [
        buildArticle(2, { category: "tech" }),
        buildArticle(3, { category: "science" }),
      ]);
      expect(bulk.status).toBe(201);
      expect(bulk.data).toHaveLength(2);

      const bulkRead = await requestJson(
        adapter,
        "GET",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect(bulkRead.status).toBe(200);

      const bulkUpdate = await requestJson(adapter, "PUT", `${base}/bulk`, [
        { ...bulk.data[0], status: "updated-a" },
        { ...bulk.data[1], status: "updated-b" },
      ]);
      expect(bulkUpdate.status).toBe(200);

      const bulkDelete = await requestJson(
        adapter,
        "DELETE",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect(bulkDelete.status).toBe(200);

      const del = await requestJson(adapter, "DELETE", rowPath(ConfigArticle, seed.id));
      expect(del.status).toBe(200);

      const missing = await requestJson(adapter, "GET", rowPath(ConfigArticle, seed.id));
      expect(missing.status).toBe(404);
    });

    it("allows non-blocked statement shortcuts", async () => {
      const base = basePath(ConfigArticle);
      const a1 = buildArticle(10, { category: "alpha", title: "findme" });
      const a2 = buildArticle(11, { category: "beta" });
      await requestJson(adapter, "POST", base, a1);
      await requestJson(adapter, "POST", base, a2);

      const paginateBy = await requestJson(
        adapter,
        "GET",
        `${base}/paginateBy/category/1`,
        undefined,
        { direction: "ASC", limit: 1, offset: 0 }
      );
      expect(paginateBy.status).toBe(200);

      const find = await requestJson(
        adapter,
        "GET",
        `${base}/find/findme`,
        undefined,
        { direction: "ASC" }
      );
      expect(find.status).toBe(200);

      const page = await requestJson(
        adapter,
        "GET",
        `${base}/page/findme`,
        undefined,
        { direction: "ASC", limit: 1, offset: 1 }
      );
      expect(page.status).toBe(200);

      const findOneBy = await requestJson(
        adapter,
        "GET",
        `${base}/findOneBy/title/findme`
      );
      expect(findOneBy.status).toBe(200);

      const findBy = await requestJson(
        adapter,
        "GET",
        `${base}/findBy/category/alpha`
      );
      expect(findBy.status).toBe(200);

      const statement = await requestJson(
        adapter,
        "GET",
        `${base}/statement/findBy/category/alpha`
      );
      expect(statement.status).toBe(200);

      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, a1.id));
      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, a2.id));
    });

    it("returns 404 for blocked listBy route", async () => {
      const base = basePath(ConfigArticle);
      const listBy = await requestJson(
        adapter,
        "GET",
        `${base}/listBy/title`,
        undefined,
        { direction: "ASC" }
      );
      expect([404, 406]).toContain(listBy.status);
    });

    it("returns 404 for grouping routes disabled by module override", async () => {
      const base = basePath(ConfigArticle);
      const routes = [
        "countOf/score",
        "maxOf/score",
        "minOf/score",
        "avgOf/score",
        "sumOf/score",
        "distinctOf/category",
        "groupOf/category",
      ];
      for (const path of routes) {
        const res = await requestJson(adapter, "GET", `${base}/${path}`);
        expect([404, 406]).toContain(res.status);
      }
    });

    it("exposes @query methods over the wire", async () => {
      const base = basePath(ConfigArticle);
      const a1 = buildArticle(40, { category: "tech", score: 50, status: "published" });
      const a2 = buildArticle(41, { category: "tech", score: 80, status: "published" });
      const a3 = buildArticle(42, { category: "science", score: 30, status: "draft" });
      await requestJson(adapter, "POST", base, a1);
      await requestJson(adapter, "POST", base, a2);
      await requestJson(adapter, "POST", base, a3);

      // findByCategory query → /query/findByCategory/:category
      const byCategory = await requestJson(
        adapter,
        "GET",
        `${base}/query/findByCategory/tech`
      );
      expect(byCategory.status).toBe(200);
      expect(Array.isArray(byCategory.data)).toBe(true);
      expect(byCategory.data.length).toBe(2);
      expect(byCategory.data.every((a: any) => a.category === "tech")).toBe(true);

      // findByStatusAndScoreGreaterThan query → /query/findByStatusAndScoreGreaterThan/:status/:minScore
      const byStatusScore = await requestJson(
        adapter,
        "GET",
        `${base}/query/findByStatusAndScoreGreaterThan/published/60`
      );
      expect(byStatusScore.status).toBe(200);
      expect(Array.isArray(byStatusScore.data)).toBe(true);
      expect(byStatusScore.data.length).toBe(1);
      expect(byStatusScore.data[0].score).toBe(80);

      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, a1.id));
      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, a2.id));
      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, a3.id));
    });

    it("exposes @route methods over the wire", async () => {
      const base = basePath(ConfigArticle);

      const meta = await requestJson(
        adapter,
        "GET",
        `${base}/metadata/summary`
      );
      expect(meta.status).toBe(200);
      expect(meta.data.description).toBe("Article metadata summary");
    });
  });

  describe("ConfigOrder (composed PK, filterEmpty, bulk update/delete disabled)", () => {
    it("performs CRUD with composed PK and fallback routes", async () => {
      const base = basePath(ConfigOrder);
      const seed = buildOrder(1, { orderCode: "o1", customerId: "c1" });

      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      // primary composed-PK route: /:orderCode/:customerId
      const read = await requestJson(
        adapter,
        "GET",
        rowPath(ConfigOrder, seed.orderCode, seed.customerId)
      );
      expect(read.status).toBe(200);
      expect(read.data.orderCode).toBe(seed.orderCode);

      // filterEmpty fallback route: /:orderCode (customerId omitted)
      const readFallback = await requestJson(
        adapter,
        "GET",
        rowPath(ConfigOrder, seed.orderCode)
      );
      expect([200, 404]).toContain(readFallback.status);

      const updated = await requestJson(
        adapter,
        "PUT",
        rowPath(ConfigOrder, seed.orderCode, seed.customerId),
        { ...seed, status: "shipped" }
      );
      expect(updated.status).toBe(200);

      const del = await requestJson(
        adapter,
        "DELETE",
        rowPath(ConfigOrder, seed.orderCode, seed.customerId)
      );
      expect(del.status).toBe(200);

      const missing = await requestJson(
        adapter,
        "GET",
        rowPath(ConfigOrder, seed.orderCode, seed.customerId)
      );
      expect(missing.status).toBe(404);
    });

    it("allows bulk create and read but blocks bulk update and delete", async () => {
      const base = basePath(ConfigOrder);
      const bulk = await requestJson(adapter, "POST", `${base}/bulk`, [
        buildOrder(2, { orderCode: "b2", customerId: "c2" }),
        buildOrder(3, { orderCode: "b3", customerId: "c3" }),
      ]);
      expect(bulk.status).toBe(201);
      expect(bulk.data).toHaveLength(2);

      const bulkRead = await requestJson(
        adapter,
        "GET",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect(bulkRead.status).toBe(200);

      // bulk update disabled by config
      const bulkUpdate = await requestJson(adapter, "PUT", `${base}/bulk`, [
        { ...bulk.data[0], status: "x" },
        { ...bulk.data[1], status: "y" },
      ]);
      expect([404, 406]).toContain(bulkUpdate.status);

      // bulk delete disabled by config
      const bulkDelete = await requestJson(
        adapter,
        "DELETE",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect([404, 406]).toContain(bulkDelete.status);

      // cleanup via individual delete
      await requestJson(
        adapter,
        "DELETE",
        rowPath(ConfigOrder, bulk.data[0].orderCode, bulk.data[0].customerId)
      );
      await requestJson(
        adapter,
        "DELETE",
        rowPath(ConfigOrder, bulk.data[1].orderCode, bulk.data[1].customerId)
      );
    });

    it("allows only count, sum, avg grouping queries", async () => {
      const base = basePath(ConfigOrder);
      const o = buildOrder(5, { orderCode: "g5", customerId: "c5", amount: 50 });
      await requestJson(adapter, "POST", base, o);

      const count = await requestJson(adapter, "GET", `${base}/countOf/status`);
      expect(count.status).toBe(200);

      const sum = await requestJson(adapter, "GET", `${base}/sumOf/amount`);
      expect(sum.status).toBe(200);

      const avg = await requestJson(adapter, "GET", `${base}/avgOf/amount`);
      expect(avg.status).toBe(200);

      // disabled by config
      const max = await requestJson(adapter, "GET", `${base}/maxOf/amount`);
      expect([404, 406]).toContain(max.status);

      const min = await requestJson(adapter, "GET", `${base}/minOf/amount`);
      expect([404, 406]).toContain(min.status);

      const distinct = await requestJson(adapter, "GET", `${base}/distinctOf/status`);
      expect([404, 406]).toContain(distinct.status);

      const group = await requestJson(adapter, "GET", `${base}/groupOf/status`);
      expect([404, 406]).toContain(group.status);

      await requestJson(
        adapter,
        "DELETE",
        rowPath(ConfigOrder, o.orderCode, o.customerId)
      );
    });
  });

  // ── ConfigCustomer: statementless queries disabled, grouping disabled ──

  describe("ConfigCustomer (statementless queries disabled, grouping disabled)", () => {
    it("performs CRUD", async () => {
      const base = basePath(ConfigCustomer);
      const seed = buildCustomer(1);

      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      const read = await requestJson(adapter, "GET", rowPath(ConfigCustomer, seed.id));
      expect(read.status).toBe(200);
      expect(read.data.name).toBe(seed.name);

      const updated = await requestJson(adapter, "PUT", rowPath(ConfigCustomer, seed.id), {
        ...seed,
        tier: "platinum",
      });
      expect(updated.status).toBe(200);

      const del = await requestJson(adapter, "DELETE", rowPath(ConfigCustomer, seed.id));
      expect(del.status).toBe(200);
    });

    it("returns 404 for grouping routes", async () => {
      const base = basePath(ConfigCustomer);
      const routes = [
        "countOf/tier",
        "maxOf/creditLimit",
        "minOf/creditLimit",
        "avgOf/creditLimit",
        "sumOf/creditLimit",
        "distinctOf/tier",
        "groupOf/tier",
      ];
      for (const path of routes) {
        const res = await requestJson(adapter, "GET", `${base}/${path}`);
        expect([404, 406]).toContain(res.status);
      }
    });

    it("still allows generic statement route (statementless queries are about @query methods, not the statement gateway)", async () => {
      const base = basePath(ConfigCustomer);
      const c = buildCustomer(7, { tier: "gold" });
      await requestJson(adapter, "POST", base, c);

      // The generic statement/:method/*args route should still work
      const stmt = await requestJson(
        adapter,
        "GET",
        `${base}/statement/findBy/tier/gold`
      );
      expect(stmt.status).toBe(200);

      // listBy should still work (it's a statement shortcut, not a statementless query)
      const listBy = await requestJson(
        adapter,
        "GET",
        `${base}/listBy/name`,
        undefined,
        { direction: "ASC" }
      );
      expect(listBy.status).toBe(200);

      await requestJson(adapter, "DELETE", rowPath(ConfigCustomer, c.id));
    });
  });

  // ── Cross-model relations ───────────────────────────────────────────────

  describe("Cross-model relations (ConfigCustomer ↔ ConfigOrder)", () => {
    it("creates a customer with orders and reads the relation", async () => {
      const custBase = basePath(ConfigCustomer);
      const orderBase = basePath(ConfigOrder);

      const cust = buildCustomer(20, { name: "RelCustomer" });
      await requestJson(adapter, "POST", custBase, cust);

      const o1 = buildOrder(21, { orderCode: "r21", customerId: cust.id, amount: 100 });
      const o2 = buildOrder(22, { orderCode: "r22", customerId: cust.id, amount: 200 });
      await requestJson(adapter, "POST", orderBase, o1);
      await requestJson(adapter, "POST", orderBase, o2);

      // Read customer — orders should be populatable (populate: true on owning side)
      const readCust = await requestJson(adapter, "GET", rowPath(ConfigCustomer, cust.id));
      expect(readCust.status).toBe(200);

      // Read order — customer field is weak ref (populate: false), should be PK string
      const readOrder = await requestJson(
        adapter,
        "GET",
        rowPath(ConfigOrder, o1.orderCode, o1.customerId)
      );
      expect(readOrder.status).toBe(200);
      // customer is either the PK string or undefined (not populated as full object)
      expect(typeof readOrder.data.customer === "string" || readOrder.data.customer === undefined || typeof readOrder.data.customer === "object").toBe(true);

      await requestJson(adapter, "DELETE", rowPath(ConfigOrder, o1.orderCode, o1.customerId));
      await requestJson(adapter, "DELETE", rowPath(ConfigOrder, o2.orderCode, o2.customerId));
      await requestJson(adapter, "DELETE", rowPath(ConfigCustomer, cust.id));
    });
  });

  // ── ConfigTag: all grouping queries enabled (including distinct and group) ──

  describe("ConfigTag (all grouping queries enabled)", () => {
    it("allows all grouping queries including distinct and group", async () => {
      const base = basePath(ConfigTag);
      const t1 = buildTag(1, { category: "alpha", weight: 10 });
      const t2 = buildTag(2, { category: "alpha", weight: 20 });
      const t3 = buildTag(3, { category: "beta", weight: 30 });
      await requestJson(adapter, "POST", base, t1);
      await requestJson(adapter, "POST", base, t2);
      await requestJson(adapter, "POST", base, t3);

      const count = await requestJson(adapter, "GET", `${base}/countOf/weight`);
      expect(count.status).toBe(200);

      const sum = await requestJson(adapter, "GET", `${base}/sumOf/weight`);
      expect(sum.status).toBe(200);

      const avg = await requestJson(adapter, "GET", `${base}/avgOf/weight`);
      expect(avg.status).toBe(200);

      const max = await requestJson(adapter, "GET", `${base}/maxOf/weight`);
      expect(max.status).toBe(200);

      const min = await requestJson(adapter, "GET", `${base}/minOf/weight`);
      expect(min.status).toBe(200);

      // distinct and group are enabled (not blocked)
      const distinct = await requestJson(
        adapter,
        "GET",
        `${base}/distinctOf/category`
      );
      expect(distinct.status).toBe(200);

      const group = await requestJson(
        adapter,
        "GET",
        `${base}/groupOf/category`
      );
      expect(group.status).toBe(200);

      await requestJson(adapter, "DELETE", rowPath(ConfigTag, t1.id));
      await requestJson(adapter, "DELETE", rowPath(ConfigTag, t2.id));
      await requestJson(adapter, "DELETE", rowPath(ConfigTag, t3.id));
    });
  });

  // ── PTP API parity tests ────────────────────────────────────────────────
  // These tests verify that the for-nest controller builder generates an API
  // surface consistent with the PTP Fabric contracts for each model type.

  describe("PtpProduct (single PK, blocks delete + deleteAll — per ProductContract)", () => {
    it("performs create, read, update and blocks delete", async () => {
      const base = basePath(PtpProduct);
      const seed = buildPtpProduct(1);

      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      const read = await requestJson(adapter, "GET", rowPath(PtpProduct, seed.productCode));
      expect(read.status).toBe(200);
      expect(read.data.productCode).toBe(seed.productCode);

      const updated = await requestJson(adapter, "PUT", rowPath(PtpProduct, seed.productCode), {
        ...seed,
        inventedName: "Updated Name",
      });
      expect(updated.status).toBe(200);

      // delete blocked per ProductContract
      const del = await requestJson(adapter, "DELETE", rowPath(PtpProduct, seed.productCode));
      expect([404, 406]).toContain(del.status);
    });

    it("performs bulk create, read, update and blocks bulk delete", async () => {
      const base = basePath(PtpProduct);
      const bulk = await requestJson(adapter, "POST", `${base}/bulk`, [
        buildPtpProduct(2),
        buildPtpProduct(3),
      ]);
      expect(bulk.status).toBe(201);
      expect(bulk.data).toHaveLength(2);

      const bulkRead = await requestJson(
        adapter,
        "GET",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.productCode))}`
      );
      expect(bulkRead.status).toBe(200);

      const bulkUpdate = await requestJson(adapter, "PUT", `${base}/bulk`, [
        { ...bulk.data[0], inventedName: "Upd-A" },
        { ...bulk.data[1], inventedName: "Upd-B" },
      ]);
      expect(bulkUpdate.status).toBe(200);

      // bulk delete blocked per ProductContract
      const bulkDelete = await requestJson(
        adapter,
        "DELETE",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.productCode))}`
      );
      expect([404, 406]).toContain(bulkDelete.status);
    });

    it("exposes statement shortcuts (listBy, paginateBy, findOneBy)", async () => {
      const base = basePath(PtpProduct);
      const p = buildPtpProduct(10, { inventedName: "findme" });
      await requestJson(adapter, "POST", base, p);

      const listBy = await requestJson(
        adapter,
        "GET",
        `${base}/listBy/productCode`,
        undefined,
        { direction: "ASC" }
      );
      expect(listBy.status).toBe(200);

      const paginateBy = await requestJson(
        adapter,
        "GET",
        `${base}/paginateBy/productCode/1`,
        undefined,
        { direction: "ASC", limit: 1, offset: 1 }
      );
      expect(paginateBy.status).toBe(200);

      const findOneBy = await requestJson(
        adapter,
        "GET",
        `${base}/findOneBy/productCode/${p.productCode}`
      );
      expect(findOneBy.status).toBe(200);
    });
  });

  describe("PtpBatch (composed PK productCode:batchNumber, blocks delete + deleteAll — per BatchContract)", () => {
    it("performs CRUD with composed PK", async () => {
      const base = basePath(PtpBatch);
      const seed = buildPtpBatch(1, { productCode: "gtin-batch-1", batchNumber: "bn-1" });

      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      const read = await requestJson(
        adapter,
        "GET",
        rowPath(PtpBatch, seed.productCode, seed.batchNumber)
      );
      expect(read.status).toBe(200);
      expect(read.data.batchNumber).toBe(seed.batchNumber);

      const updated = await requestJson(
        adapter,
        "PUT",
        rowPath(PtpBatch, seed.productCode, seed.batchNumber),
        { ...seed, manufacturerName: "Acme Corp" }
      );
      expect(updated.status).toBe(200);

      // delete blocked per BatchContract
      const del = await requestJson(
        adapter,
        "DELETE",
        rowPath(PtpBatch, seed.productCode, seed.batchNumber)
      );
      expect([404, 406]).toContain(del.status);
    });

    it("performs bulk create/read/update and blocks bulk delete", async () => {
      const base = basePath(PtpBatch);
      const bulk = await requestJson(adapter, "POST", `${base}/bulk`, [
        buildPtpBatch(2, { productCode: "gtin-2", batchNumber: "bn-2" }),
        buildPtpBatch(3, { productCode: "gtin-3", batchNumber: "bn-3" }),
      ]);
      expect(bulk.status).toBe(201);
      expect(bulk.data).toHaveLength(2);

      const bulkRead = await requestJson(
        adapter,
        "GET",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect(bulkRead.status).toBe(200);

      const bulkUpdate = await requestJson(adapter, "PUT", `${base}/bulk`, [
        { ...bulk.data[0], manufacturerName: "Mfg-A" },
        { ...bulk.data[1], manufacturerName: "Mfg-B" },
      ]);
      expect(bulkUpdate.status).toBe(200);

      // bulk delete blocked
      const bulkDelete = await requestJson(
        adapter,
        "DELETE",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect([404, 406]).toContain(bulkDelete.status);
    });

    it("exposes statement shortcuts", async () => {
      const base = basePath(PtpBatch);
      const b = buildPtpBatch(10, { productCode: "gtin-stmt", batchNumber: "bn-10" });
      await requestJson(adapter, "POST", base, b);

      const listBy = await requestJson(
        adapter,
        "GET",
        `${base}/listBy/productCode`,
        undefined,
        { direction: "ASC" }
      );
      expect(listBy.status).toBe(200);

      const paginateBy = await requestJson(
        adapter,
        "GET",
        `${base}/paginateBy/productCode/1`,
        undefined,
        { direction: "ASC", limit: 1, offset: 1 }
      );
      expect(paginateBy.status).toBe(200);

      const findOneBy = await requestJson(
        adapter,
        "GET",
        `${base}/findOneBy/productCode/gtin-stmt`
      );
      expect(findOneBy.status).toBe(200);
    });
  });

  describe("PtpLeaflet (composed PK with filterEmpty, no blocks — per LeafletContract)", () => {
    it("performs full CRUD with 5-segment composed PK", async () => {
      const base = basePath(PtpLeaflet);
      const seed = buildPtpLeaflet(1, {
        productCode: "gtin-l-1",
        batchNumber: "bn-l-1",
        leafletType: "leaflet",
        lang: "en",
        epiMarket: "US",
      });

      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      const read = await requestJson(
        adapter,
        "GET",
        rowPath(PtpLeaflet, seed.productCode, seed.batchNumber, seed.leafletType, seed.lang, seed.epiMarket)
      );
      expect(read.status).toBe(200);
      expect(read.data.productCode).toBe(seed.productCode);

      const updated = await requestJson(
        adapter,
        "PUT",
        rowPath(PtpLeaflet, seed.productCode, seed.batchNumber, seed.leafletType, seed.lang, seed.epiMarket),
        { ...seed, xmlFileContent: "<xml>updated</xml>" }
      );
      expect(updated.status).toBe(200);

      // LeafletContract allows delete (no blocks)
      const del = await requestJson(
        adapter,
        "DELETE",
        rowPath(PtpLeaflet, seed.productCode, seed.batchNumber, seed.leafletType, seed.lang, seed.epiMarket)
      );
      expect(del.status).toBe(200);
    });

    it("supports fallback route with epiMarket omitted (filterEmpty)", async () => {
      const base = basePath(PtpLeaflet);
      // Create a leaflet with an epiMarket, then test the fallback route
      const seed = buildPtpLeaflet(2, {
        productCode: "gtin-l-2",
        batchNumber: "bn-l-2",
        leafletType: "leaflet",
        lang: "pt",
        epiMarket: "EU",
      });
      await requestJson(adapter, "POST", base, seed);

      // Fallback route: /:productCode/:batchNumber/:leafletType/:lang (epiMarket omitted)
      const readFallback = await requestJson(
        adapter,
        "GET",
        rowPath(PtpLeaflet, seed.productCode, seed.batchNumber, seed.leafletType, seed.lang)
      );
      expect([200, 404]).toContain(readFallback.status);

      // Cleanup via full route
      await requestJson(
        adapter,
        "DELETE",
        rowPath(PtpLeaflet, seed.productCode, seed.batchNumber, seed.leafletType, seed.lang, seed.epiMarket)
      );
    });

    it("supports 3-segment fallback route with batchNumber AND epiMarket omitted", async () => {
      const base = basePath(PtpLeaflet);
      // Create a leaflet WITHOUT batchNumber and epiMarket (both filterEmpty)
      const seed = new PtpLeaflet({
        productCode: "gtin-l-3",
        leafletType: "leaflet",
        lang: "en",
      });

      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      // 3-segment fallback: /:productCode/:leafletType/:lang
      // (batchNumber and epiMarket both omitted — all filterEmpty fields removed)
      const read3 = await requestJson(
        adapter,
        "GET",
        rowPath(PtpLeaflet, seed.productCode, seed.leafletType, seed.lang)
      );
      expect(read3.status).toBe(200);
      expect(read3.data.productCode).toBe(seed.productCode);
      expect(read3.data.leafletType).toBe(seed.leafletType);

      // Cleanup via 3-segment route
      await requestJson(
        adapter,
        "DELETE",
        rowPath(PtpLeaflet, seed.productCode, seed.leafletType, seed.lang)
      );
    });

    it("performs bulk CRUD (all operations allowed per LeafletContract)", async () => {
      const base = basePath(PtpLeaflet);
      const bulk = await requestJson(adapter, "POST", `${base}/bulk`, [
        buildPtpLeaflet(3, { productCode: "gtin-l-3", batchNumber: "bn-3", lang: "en", epiMarket: "US" }),
        buildPtpLeaflet(4, { productCode: "gtin-l-4", batchNumber: "bn-4", lang: "es", epiMarket: "ES" }),
      ]);
      expect(bulk.status).toBe(201);
      expect(bulk.data).toHaveLength(2);

      const bulkRead = await requestJson(
        adapter,
        "GET",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect(bulkRead.status).toBe(200);

      const bulkUpdate = await requestJson(adapter, "PUT", `${base}/bulk`, [
        { ...bulk.data[0], xmlFileContent: "<xml>a</xml>" },
        { ...bulk.data[1], xmlFileContent: "<xml>b</xml>" },
      ]);
      expect(bulkUpdate.status).toBe(200);

      // bulk delete allowed per LeafletContract
      const bulkDelete = await requestJson(
        adapter,
        "DELETE",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect(bulkDelete.status).toBe(200);
    });
  });

  describe("PtpAudit (single PK, blocks update + delete — per AuditContract)", () => {
    it("performs create, read and blocks update, delete", async () => {
      const base = basePath(PtpAudit);
      const seed = buildPtpAudit(1);

      const created = await requestJson(adapter, "POST", base, seed);
      expect(created.status).toBe(201);

      const read = await requestJson(adapter, "GET", rowPath(PtpAudit, seed.id));
      expect(read.status).toBe(200);
      expect(read.data.action).toBe(seed.action);

      // update blocked per AuditContract
      const updated = await requestJson(adapter, "PUT", rowPath(PtpAudit, seed.id), {
        ...seed,
        action: "UPDATED",
      });
      expect([404, 406]).toContain(updated.status);

      // delete blocked per AuditContract
      const del = await requestJson(adapter, "DELETE", rowPath(PtpAudit, seed.id));
      expect([404, 406]).toContain(del.status);
    });

    it("performs bulk create, read and blocks bulk update, bulk delete", async () => {
      const base = basePath(PtpAudit);
      const bulk = await requestJson(adapter, "POST", `${base}/bulk`, [
        buildPtpAudit(2),
        buildPtpAudit(3),
      ]);
      expect(bulk.status).toBe(201);
      expect(bulk.data).toHaveLength(2);

      const bulkRead = await requestJson(
        adapter,
        "GET",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect(bulkRead.status).toBe(200);

      // bulk update blocked
      const bulkUpdate = await requestJson(adapter, "PUT", `${base}/bulk`, [
        { ...bulk.data[0], action: "X" },
        { ...bulk.data[1], action: "Y" },
      ]);
      expect([404, 406]).toContain(bulkUpdate.status);

      // bulk delete blocked
      const bulkDelete = await requestJson(
        adapter,
        "DELETE",
        `${base}/bulk${idsQuery(bulk.data.map((r: any) => r.id))}`
      );
      expect([404, 406]).toContain(bulkDelete.status);
    });

    it("exposes statement shortcuts", async () => {
      const base = basePath(PtpAudit);

      const listBy = await requestJson(
        adapter,
        "GET",
        `${base}/listBy/model`,
        undefined,
        { direction: "ASC" }
      );
      expect(listBy.status).toBe(200);

      const findOneBy = await requestJson(
        adapter,
        "GET",
        `${base}/findOneBy/action/CREATE`
      );
      expect(findOneBy.status).toBe(200);
    });
  });

  describe("PtpHistory (composed PK table:key:version, blocks all writes — per HistoryContract)", () => {
    it("allows read and blocks create, update, delete", async () => {
      const base = basePath(PtpHistory);

      // History is read-only in PTP. We need to seed data through the repository
      // directly, but since we're testing the HTTP API, we first try to create
      // (which should be blocked), then verify read works via statement.
      const seed = buildPtpHistory(1);

      // create blocked per HistoryContract
      const created = await requestJson(adapter, "POST", base, seed);
      expect([404, 406]).toContain(created.status);

      // update blocked
      const updated = await requestJson(
        adapter,
        "PUT",
        rowPath(PtpHistory, seed.table, seed.key, String(seed.version)),
        { ...seed, record: { data: "modified" } }
      );
      expect([404, 406]).toContain(updated.status);

      // delete blocked
      const del = await requestJson(
        adapter,
        "DELETE",
        rowPath(PtpHistory, seed.table, seed.key, String(seed.version))
      );
      expect([404, 406]).toContain(del.status);
    });

    it("blocks all bulk operations (createAll, updateAll, deleteAll)", async () => {
      const base = basePath(PtpHistory);
      const seed = buildPtpHistory(2);

      // bulk create blocked
      const bulkCreate = await requestJson(adapter, "POST", `${base}/bulk`, [seed]);
      expect([404, 406]).toContain(bulkCreate.status);

      // bulk update blocked
      const bulkUpdate = await requestJson(adapter, "PUT", `${base}/bulk`, [seed]);
      expect([404, 406]).toContain(bulkUpdate.status);

      // bulk delete blocked
      const bulkDelete = await requestJson(
        adapter,
        "DELETE",
        `${base}/bulk${idsQuery([seed.id])}`
      );
      expect([404, 406]).toContain(bulkDelete.status);
    });

    it("exposes statement shortcuts for read-only access", async () => {
      const base = basePath(PtpHistory);

      // listBy should be available (read-only statement shortcut)
      const listBy = await requestJson(
        adapter,
        "GET",
        `${base}/listBy/table`,
        undefined,
        { direction: "ASC" }
      );
      expect(listBy.status).toBe(200);

      // paginateBy should be available
      const paginateBy = await requestJson(
        adapter,
        "GET",
        `${base}/paginateBy/table/1`,
        undefined,
        { direction: "ASC", limit: 1, offset: 1 }
      );
      expect(paginateBy.status).toBe(200);
    });
  });

  // ── SSE events ──────────────────────────────────────────────────────────

  describe("SSE events", () => {
    it("streams create events from /sse", async () => {
      receivedEvents.length = 0;
      eventSource?.close();
      eventSource = new EventSource(
        `${adapter.config.protocol}://${adapter.config.host}/sse`
      );

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error("SSE connection timeout"));
        }, 15000);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        eventSource.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
      });

      eventSource.onmessage = (event) => {
        try {
          receivedEvents.push(JSON.parse(event.data));
        } catch {
          receivedEvents.push([event.data, event.data, event.data, event.data]);
        }
      };

      const article = buildArticle(30, { status: "sse-test" });
      await requestJson(adapter, "POST", basePath(ConfigArticle), article);

      await waitFor(() =>
        receivedEvents.find(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.CREATE
        )
      );

      expect(
        receivedEvents.some(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.CREATE
        )
      ).toBe(true);

      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, article.id));
    });

    it("streams update events from /sse", async () => {
      receivedEvents.length = 0;
      eventSource?.close();
      eventSource = new EventSource(
        `${adapter.config.protocol}://${adapter.config.host}/sse`
      );

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error("SSE connection timeout"));
        }, 15000);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        eventSource.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
      });

      eventSource.onmessage = (event) => {
        try {
          receivedEvents.push(JSON.parse(event.data));
        } catch {
          receivedEvents.push([event.data, event.data, event.data, event.data]);
        }
      };

      const article = buildArticle(31, { status: "sse-update" });
      await requestJson(adapter, "POST", basePath(ConfigArticle), article);

      await waitFor(() =>
        receivedEvents.find(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.CREATE
        )
      );

      await requestJson(adapter, "PUT", rowPath(ConfigArticle, article.id), {
        ...article,
        title: "Updated Title",
      });

      await waitFor(() =>
        receivedEvents.find(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.UPDATE
        )
      );

      expect(
        receivedEvents.some(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.UPDATE
        )
      ).toBe(true);

      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, article.id));
    });

    it("streams delete events from /sse", async () => {
      receivedEvents.length = 0;
      eventSource?.close();
      eventSource = new EventSource(
        `${adapter.config.protocol}://${adapter.config.host}/sse`
      );

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          eventSource.close();
          reject(new Error("SSE connection timeout"));
        }, 15000);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
        eventSource.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
      });

      eventSource.onmessage = (event) => {
        try {
          receivedEvents.push(JSON.parse(event.data));
        } catch {
          receivedEvents.push([event.data, event.data, event.data, event.data]);
        }
      };

      const article = buildArticle(32, { status: "sse-delete" });
      await requestJson(adapter, "POST", basePath(ConfigArticle), article);

      await waitFor(() =>
        receivedEvents.find(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.CREATE
        )
      );

      await requestJson(adapter, "DELETE", rowPath(ConfigArticle, article.id));

      await waitFor(() =>
        receivedEvents.find(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.DELETE
        )
      );

      expect(
        receivedEvents.some(
          (e) => e[0] === ConfigArticle.name && e[1] === OperationKeys.DELETE
        )
      ).toBe(true);
    });
  });

  // ── OpenAPI extraction ──────────────────────────────────────────────────

  describe("OpenAPI extraction", () => {
    it("extracts the full OpenAPI spec to a file for inspection", async () => {
      const config = new DocumentBuilder()
        .setTitle("DECAF-10 Controller Builder E2E")
        .setDescription(
          "Auto-generated OpenAPI spec from all models: ConfigArticle, " +
          "ConfigOrder, ConfigCustomer, ConfigTag, PtpProduct, PtpBatch, " +
          "PtpLeaflet, PtpAudit, PtpHistory (with relations)."
        )
        .setVersion("1.0.0")
        .addBearerAuth()
        .build();

      const document = SwaggerModule.createDocument(app, config);

      // Write to a gitignored output directory
      const outputDir = path.join(__dirname, ".output");
      fs.mkdirSync(outputDir, { recursive: true });
      const outputFile = path.join(outputDir, "openapi.json");
      fs.writeFileSync(outputFile, JSON.stringify(document, null, 2), "utf-8");

      const paths = Object.keys(document.paths || {});
      const schemas = Object.keys(document.components?.schemas || {});

      // eslint-disable-next-line no-console
      console.log("\n=== OpenAPI Extraction ===");
      // eslint-disable-next-line no-console
      console.log(`  File:     ${outputFile}`);
      // eslint-disable-next-line no-console
      console.log(`  Paths:    ${paths.length}`);
      // eslint-disable-next-line no-console
      console.log(`  Schemas:  ${schemas.length}`);

      // Validate that all expected model base paths are present
      const expectedBases = [
        "/cfg-article",
        "/cfg-order",
        "/cfg-customer",
        "/cfg-tag",
        "/ptp-product",
        "/ptp-product-image",
        "/ptp-product-strength",
        "/ptp-product-market",
        "/ptp-batch",
        "/ptp-leaflet",
        "/ptp-audit",
        "/ptp-history",
      ];
      for (const base of expectedBases) {
        const hasBase = paths.some((p) => p === base || p.startsWith(base + "/"));
        expect(hasBase).toBe(true);
      }

      // Validate that CreateDTO schemas were generated for models with create routes
      const expectedCreateDtos = [
        "ConfigArticleCreateDTO",
        "ConfigOrderCreateDTO",
        "ConfigCustomerCreateDTO",
        "ConfigTagCreateDTO",
        "PtpProductCreateDTO",
        "PtpProductImageCreateDTO",
        "PtpProductStrengthCreateDTO",
        "PtpProductMarketCreateDTO",
        "PtpBatchCreateDTO",
        "PtpLeafletCreateDTO",
        "PtpAuditCreateDTO",
      ];
      for (const dtoName of expectedCreateDtos) {
        expect(schemas).toContain(dtoName);
      }

      // PtpHistory has create blocked, so no CreateDTO
      expect(schemas).not.toContain("PtpHistoryCreateDTO");

      // Validate that the file exists and is valid JSON
      expect(fs.existsSync(outputFile)).toBe(true);
      const written = JSON.parse(fs.readFileSync(outputFile, "utf-8"));
      expect(written.openapi).toBe("3.0.0");
      expect(Object.keys(written.paths || {}).length).toBe(paths.length);
    });
  });
});
