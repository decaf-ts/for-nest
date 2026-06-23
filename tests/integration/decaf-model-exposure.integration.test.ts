import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  Adapter,
  column,
  createdAt,
  defaultQueryAttr,
  pk,
  Repository,
  table,
  updatedAt,
} from "@decaf-ts/core";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { NanoAdapter, NanoFlavour } from "@decaf-ts/for-nano";
import { Model, ModelArg, model, required } from "@decaf-ts/decorator-validation";
import { uses, Metadata, DecorationKeys } from "@decaf-ts/decoration";
import { AxiosHttpAdapter } from "@decaf-ts/for-http";
import { RequestToContextTransformer } from "@decaf-ts/for-http/server";
import { EventSource } from "eventsource";
import { toKebabCase } from "@decaf-ts/logging";

import { DecafExceptionFilter, DecafModule } from "../../src";
import { DecafStreamModule } from "../../src/events-module";
import { expose } from "../../src/decaf-model";
import { DecafModuleOptions } from "../../src/types";
import { composed } from "@decaf-ts/db-decorators";

RamAdapter.decoration();
NanoAdapter.decoration();
Metadata.set(DecorationKeys.FLAVOUR, RamFlavour, []);
Metadata.set(DecorationKeys.FLAVOUR, NanoFlavour, []);
Model.setBuilder(Model.fromModel);
Adapter.setCurrent(RamFlavour);

jest.setTimeout(180000);

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

async function createNanoTestResources(prefix: string) {
  const adminUser = process.env.NANO_ADMIN_USER || "couchdb.admin";
  const adminPassword = process.env.NANO_ADMIN_PASSWORD || "couchdb.admin";
  const dbHost = process.env.NANO_HOST || "localhost:10010";
  const dbProtocol = (process.env.NANO_PROTOCOL as "http" | "https") || "http";

  const suffix = randomSuffix();
  const dbName = `${prefix}_${suffix}`;
  const user = `${prefix}_user_${suffix}`;
  const password = `${user}_pw`;
  const connection = NanoAdapter.connect(
    adminUser,
    adminPassword,
    dbHost,
    dbProtocol
  );

  await NanoAdapter.createDatabase(connection, dbName).catch((e: any) => {
    if (!(e instanceof Error) || (e as any).error !== "file_exists") {
      throw e;
    }
  });
  await NanoAdapter.createUser(connection, dbName, user, password).catch(
    (e: any) => {
      if (!(e instanceof Error) || (e as any).error !== "file_exists") {
        throw e;
      }
    }
  );

  return {
    connection,
    dbName,
    user,
    password,
    host: dbHost,
    protocol: dbProtocol,
  };
}

async function cleanupNanoTestResources(resources: Awaited<
  ReturnType<typeof createNanoTestResources>
>) {
  const { connection, dbName, user } = resources;
  try {
    await NanoAdapter.deleteDatabase(connection, dbName);
  } catch (e: any) {
    if (!(e instanceof Error)) throw e;
  }
  try {
    await NanoAdapter.deleteUser(connection, dbName, user);
  } catch (e: any) {
    if (!(e instanceof Error)) throw e;
  } finally {
    NanoAdapter.closeConnection(connection);
  }
}

@uses(RamFlavour)
@table("live_ram_records")
@model()
@expose("ram")
class LiveRamRecord extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  name!: string;

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

  constructor(arg?: ModelArg<LiveRamRecord>) {
    super(arg);
  }
}

@uses(RamFlavour)
@uses(NanoFlavour)
@table("live_switch_records")
@model()
@expose("ram")
class LiveSwitchRecord extends Model {
  @composed(["code", "region"], ":")
  @pk({ type: String, generated: false })
  id!: string;

  @defaultQueryAttr()
  @column()
  @required()
  code!: string;

  @defaultQueryAttr()
  @column()
  @required()
  region!: string;

  @defaultQueryAttr()
  @column()
  @required()
  name!: string;

  @defaultQueryAttr()
  @column()
  category!: string;

  @column()
  score!: number;

  @column()
  status!: string;

  @createdAt()
  createdAt!: Date;

  @updatedAt()
  updatedAt!: Date;

  constructor(arg?: ModelArg<LiveSwitchRecord>) {
    super(arg);
  }
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
  const request: Record<string, any> = {
    method,
    url,
  };
  if (typeof data !== "undefined") {
    request.data =
      typeof data === "string" || data instanceof Buffer
        ? data
        : JSON.stringify(data);
    request.headers = {
      ...(request.headers || {}),
      "Content-Type": "application/json",
    };
  }
  if (params) request.params = params;
  const response = await adapter.client.request(request);
  if (typeof response.data === "string") {
    try {
      response.data = JSON.parse(response.data);
    } catch {
      // Leave non-JSON payloads as-is.
    }
  }
  return response;
}

function buildRamRecord(index: number, overrides: Partial<LiveRamRecord> = {}) {
  return new LiveRamRecord({
    id: overrides.id || `ram-${index}-${randomSuffix()}`,
    name: overrides.name || `ram-name-${index}`,
    category: overrides.category || (index % 2 ? "alpha" : "beta"),
    score: overrides.score ?? index * 10,
    status: overrides.status || "draft",
    ...overrides,
  });
}

function buildSwitchRecord(
  index: number,
  overrides: Partial<LiveSwitchRecord> = {}
) {
  return new LiveSwitchRecord({
    id:
      overrides.id ||
      `${overrides.code || `code-${index}`}:${overrides.region || (index % 2 ? "eu" : "us")}`,
    code: overrides.code || `code-${index}`,
    region: overrides.region || (index % 2 ? "eu" : "us"),
    name: overrides.name || `switch-name-${index}`,
    category: overrides.category || (index % 2 ? "alpha" : "beta"),
    score: overrides.score ?? index * 100,
    status: overrides.status || "draft",
    ...overrides,
  });
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
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
}

describe("DecafModel exposure integration", () => {
  let app: INestApplication;
  let nanoResources: Awaited<ReturnType<typeof createNanoTestResources>>;
  let adapter: AxiosHttpAdapter;
  let eventSource: EventSource;
  const receivedEvents: Array<[string, string, string, any]> = [];

  beforeAll(async () => {
    nanoResources = await createNanoTestResources("decaf-model-exposure");

    const moduleRef = await Test.createTestingModule({
      imports: [
        await DecafModule.forRootAsync({
          conf: [
            [RamAdapter, { UUID: "ram-user" }, new LiveTransformer()],
            [
              NanoAdapter,
              {
                user: nanoResources.user,
                password: nanoResources.password,
                host: nanoResources.host,
                dbName: nanoResources.dbName,
                protocol: nanoResources.protocol,
              },
              nanoResources.dbName,
              new LiveTransformer(),
            ],
          ],
          autoControllers: true,
          autoServices: true,
          controllerExposure: {
            [LiveSwitchRecord.name]: ["nano"],
          },
        } as DecafModuleOptions),
        DecafStreamModule.forFlavours([RamFlavour, NanoFlavour], "/sse"),
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
    adapter = new AxiosHttpAdapter({
      protocol: "http",
      host,
    });
  });

  afterAll(async () => {
    eventSource?.close();
    await app?.close();
    await cleanupNanoTestResources(nanoResources);
  });

  it("honors @expose() defaults and module overrides while routing RAM and Nano models to the correct backend", async () => {
    const ramSeed = buildRamRecord(1);
    const switchSeed = buildSwitchRecord(1, {
      code: "sw-1",
      region: "us",
    });

    const ramBase = basePath(LiveRamRecord);
    const createdRamRes = await requestJson(adapter, "POST", ramBase, ramSeed);
    expect(createdRamRes.status).toBe(201);

    const readRamRes = await requestJson(
      adapter,
      "GET",
      rowPath(LiveRamRecord, ramSeed.id)
    );
    expect(readRamRes.status).toBe(200);

    const updatedRamPayload = {
      ...ramSeed,
      status: "ready",
    };
    const updatedRamRes = await requestJson(
      adapter,
      "PUT",
      rowPath(LiveRamRecord, ramSeed.id),
      updatedRamPayload
    );
    expect(updatedRamRes.status).toBe(200);

    const ramBatchRes = await requestJson(adapter, "POST", `${ramBase}/bulk`, [
      buildRamRecord(2, { category: "alpha" }),
      buildRamRecord(3, { category: "beta" }),
    ]);
    expect(ramBatchRes.status).toBe(201);
    const ramBatch = ramBatchRes.data as LiveRamRecord[];
    expect(ramBatch).toHaveLength(2);

    const readRamBatchRes = await requestJson(
      adapter,
      "GET",
      `${ramBase}/bulk${idsQuery(ramBatch.map((row) => row.id))}`
    );
    expect(readRamBatchRes.status).toBe(200);

    const updatedRamBatchRes = await requestJson(adapter, "PUT", `${ramBase}/bulk`, [
      {
        ...ramBatch[0],
        status: "updated-a",
      },
      {
        ...ramBatch[1],
        status: "updated-b",
      },
    ]);
    expect(updatedRamBatchRes.status).toBe(200);

    const ramPaths = basePath(LiveRamRecord);
    const listBy = await requestJson(adapter, "GET", `${ramPaths}/listBy/name`, undefined, {
      direction: "ASC",
    });
    expect(listBy.status).toBe(200);

    const paginateBy = await requestJson(
      adapter,
      "GET",
      `${ramPaths}/paginateBy/name/1`,
      undefined,
      {
        direction: "ASC",
        limit: 1,
        offset: 1,
      }
    );
    expect(paginateBy.status).toBe(200);

    const find = await requestJson(adapter, "GET", `${ramPaths}/find/ram-name-1`, undefined, {
      direction: "ASC",
    });
    expect(find.status).toBe(200);

    const page = await requestJson(adapter, "GET", `${ramPaths}/page/ram-name-1`, undefined, {
      direction: "ASC",
      limit: 1,
      offset: 1,
    });
    expect(page.status).toBe(200);

    const findOneBy = await requestJson(
      adapter,
      "GET",
      `${ramPaths}/findOneBy/name/ram-name-1`
    );
    expect(findOneBy.status).toBe(200);

    const findBy = await requestJson(
      adapter,
      "GET",
      `${ramPaths}/findBy/category/alpha`
    );
    expect(findBy.status).toBe(200);

    const statementFindBy = await requestJson(
      adapter,
      "GET",
      `${ramPaths}/statement/findBy/name/ram-name-1`
    );
    expect(statementFindBy.status).toBe(200);

    const countOf = await requestJson(adapter, "GET", `${ramPaths}/countOf/category`);
    expect(countOf.status).toBe(200);

    const maxOf = await requestJson(adapter, "GET", `${ramPaths}/maxOf/score`);
    expect(maxOf.status).toBe(200);

    const minOf = await requestJson(adapter, "GET", `${ramPaths}/minOf/score`);
    expect(minOf.status).toBe(200);

    const avgOf = await requestJson(adapter, "GET", `${ramPaths}/avgOf/score`);
    expect(avgOf.status).toBe(200);

    const sumOf = await requestJson(adapter, "GET", `${ramPaths}/sumOf/score`);
    expect(sumOf.status).toBe(200);

    const distinctOf = await requestJson(
      adapter,
      "GET",
      `${ramPaths}/distinctOf/category`
    );
    expect(distinctOf.status).toBe(200);

    const groupOf = await requestJson(adapter, "GET", `${ramPaths}/groupOf/category`);
    expect(groupOf.status).toBe(200);

    Adapter.setCurrent(RamFlavour);
    const ramDirectRepo = Repository.forModel(LiveRamRecord);
    const ramDirectRead = await ramDirectRepo.read(ramSeed.id);
    expect(ramDirectRead.name).toBe(ramSeed.name);
    expect(ramDirectRead.status).toBe("ready");

    const deleteRamBatchRes = await requestJson(
      adapter,
      "DELETE",
      `${ramBase}/bulk${idsQuery(ramBatch.map((row) => row.id))}`
    );
    expect(deleteRamBatchRes.status).toBe(200);
    const deleteRamRes = await requestJson(
      adapter,
      "DELETE",
      rowPath(LiveRamRecord, ramSeed.id)
    );
    expect(deleteRamRes.status).toBe(200);
    const missingRam = await requestJson(
      adapter,
      "GET",
      rowPath(LiveRamRecord, ramSeed.id)
    );
    expect(missingRam.status).toBe(404);

    const switchBase = basePath(LiveSwitchRecord);
    const createdSwitchRes = await requestJson(adapter, "POST", switchBase, switchSeed);
    expect(createdSwitchRes.status).toBe(201);

    const readSwitchRes = await requestJson(
      adapter,
      "GET",
      rowPath(LiveSwitchRecord, switchSeed.code, switchSeed.region)
    );
    expect(readSwitchRes.status).toBe(200);

    const updatedSwitchPayload = {
      ...switchSeed,
      status: "published",
    };
    const updatedSwitchRes = await requestJson(
      adapter,
      "PUT",
      rowPath(LiveSwitchRecord, switchSeed.code, switchSeed.region),
      updatedSwitchPayload
    );
    expect(updatedSwitchRes.status).toBe(200);

    const switchBatchRes = await requestJson(adapter, "POST", `${switchBase}/bulk`, [
      buildSwitchRecord(2, { code: "sw-2", region: "us", category: "alpha" }),
      buildSwitchRecord(3, { code: "sw-3", region: "eu", category: "beta" }),
    ]);
    expect(switchBatchRes.status).toBe(201);
    const switchBatch = switchBatchRes.data as LiveSwitchRecord[];
    expect(switchBatch).toHaveLength(2);

    const readSwitchBatchRes = await requestJson(
      adapter,
      "GET",
      `${switchBase}/bulk${idsQuery(switchBatch.map((row) => row.id))}`
    );
    expect(readSwitchBatchRes.status).toBe(200);

    const updatedSwitchBatchRes = await requestJson(adapter, "PUT", `${switchBase}/bulk`, [
      {
        ...switchBatch[0],
        status: "updated-a",
      },
      {
        ...switchBatch[1],
        status: "updated-b",
      },
    ]);
    expect(updatedSwitchBatchRes.status).toBe(200);

    const switchListBy = await requestJson(adapter, "GET", `${switchBase}/listBy/name?direction=ASC`);
    expect(switchListBy.status).toBe(200);

    const switchPaginateBy = await requestJson(
      adapter,
      "GET",
      `${switchBase}/paginateBy/name/1?direction=ASC&limit=1&offset=1`
    );
    expect(switchPaginateBy.status).toBe(200);

    const switchFind = await requestJson(adapter, "GET", `${switchBase}/find/switch-name-1?direction=ASC`);
    expect(switchFind.status).toBe(200);

    const switchPage = await requestJson(
      adapter,
      "GET",
      `${switchBase}/page/switch-name-1?direction=ASC&limit=1&offset=1`
    );
    expect(switchPage.status).toBe(200);

    const switchFindOneBy = await requestJson(
      adapter,
      "GET",
      `${switchBase}/findOneBy/name/switch-name-1`
    );
    expect(switchFindOneBy.status).toBe(200);

    const switchFindBy = await requestJson(
      adapter,
      "GET",
      `${switchBase}/findBy/category/alpha`
    );
    expect(switchFindBy.status).toBe(200);

    const switchStatement = await requestJson(
      adapter,
      "GET",
      `${switchBase}/statement/findBy/name/switch-name-1`
    );
    expect(switchStatement.status).toBe(200);

    const switchCount = await requestJson(adapter, "GET", `${switchBase}/countOf/category`);
    expect(switchCount.status).toBe(200);

    const switchMax = await requestJson(adapter, "GET", `${switchBase}/maxOf/score`);
    expect(switchMax.status).toBe(200);

    const switchMin = await requestJson(adapter, "GET", `${switchBase}/minOf/score`);
    expect(switchMin.status).toBe(200);

    const switchAvg = await requestJson(adapter, "GET", `${switchBase}/avgOf/score`);
    expect(switchAvg.status).toBe(200);

    const switchSum = await requestJson(adapter, "GET", `${switchBase}/sumOf/score`);
    expect(switchSum.status).toBe(200);

    const switchDistinct = await requestJson(adapter, "GET", `${switchBase}/distinctOf/category`);
    expect(switchDistinct.status).toBe(200);

    const switchGroup = await requestJson(adapter, "GET", `${switchBase}/groupOf/category`);
    expect(switchGroup.status).toBe(200);

    Adapter.setCurrent(NanoFlavour);
    const nanoDirectRepo = Repository.forModel(LiveSwitchRecord);
    const nanoDirectRead = await nanoDirectRepo.read(switchSeed.id);
    expect(nanoDirectRead.code).toBe(switchSeed.code);
    expect(nanoDirectRead.status).toBe("published");

    const deleteSwitchBatchRes = await requestJson(
      adapter,
      "DELETE",
      `${switchBase}/bulk${idsQuery(switchBatch.map((row) => row.id))}`
    );
    expect(deleteSwitchBatchRes.status).toBe(200);
    const deleteSwitchRes = await requestJson(
      adapter,
      "DELETE",
      rowPath(LiveSwitchRecord, switchSeed.code, switchSeed.region)
    );
    expect(deleteSwitchRes.status).toBe(200);
    const missingSwitch = await requestJson(
      adapter,
      "GET",
      rowPath(LiveSwitchRecord, switchSeed.code, switchSeed.region)
    );
    expect(missingSwitch.status).toBe(404);
  });

  it("streams SSE events from /sse for both adapters", async () => {
    receivedEvents.length = 0;
    eventSource?.close();
    eventSource = new EventSource(
      `${adapter.config.protocol}://${adapter.config.host}/sse`
    );

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        eventSource.close();
        reject(new Error("Timed out waiting for SSE connection"));
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
      const raw = event.data;
      try {
        receivedEvents.push(JSON.parse(raw));
      } catch {
        receivedEvents.push([raw, raw, raw, raw]);
      }
    };

    const ramSeed = buildRamRecord(11, { status: "sse-ram" });
    const switchSeed = buildSwitchRecord(11, {
      code: "sse-11",
      region: "eu",
      status: "sse-switch",
    });

    await requestJson(adapter, "POST", basePath(LiveRamRecord), ramSeed);
    await requestJson(adapter, "POST", basePath(LiveSwitchRecord), switchSeed);

    await waitFor(() =>
      receivedEvents.length >= 2
        ? receivedEvents.find(
            (event) =>
              event[0] === LiveRamRecord.name && event[1] === "create"
          ) &&
          receivedEvents.find(
            (event) =>
              event[0] === LiveSwitchRecord.name && event[1] === "create"
          )
        : undefined
    );

    expect(
      receivedEvents.some(
        (event) =>
          event[0] === LiveRamRecord.name && event[1] === "create"
      )
    ).toBe(true);
    expect(
      receivedEvents.some(
        (event) =>
          event[0] === LiveSwitchRecord.name && event[1] === "create"
      )
    ).toBe(true);
  });
});
