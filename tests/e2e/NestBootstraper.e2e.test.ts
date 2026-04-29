import { Test } from "@nestjs/testing";
import { Controller, Get, INestApplication } from "@nestjs/common";
import { NestBootstraper } from "../../src/index";

jest.setTimeout(50000);
let serverUrl: string;
const request = async (path: string) => await fetch(`${serverUrl}/${path}`);

@Controller()
class TestController {
  @Get("/health")
  health() {
    return { status: "ok" };
  }
}

describe("NestBootstraper (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = moduleRef.createNestApplication();

    const nest = await NestBootstraper.initialize(app)
      .enableLogger()
      .enableCors("*")
      .useHelmet()
      .setupSwagger({
        title: "Test API",
        description: "Test Swagger setup",
        version: "1.0.0",
        path: "api",
        openApiJsonPath: "api-json",
        openApiYamlPath: "/api-yaml",
      })
      .useGlobalFilters();

    nest.start(3000, "0.0.0.0");
    await new Promise((res) => setTimeout(() => res(), 3000));
    serverUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    // await new Promise((res) => setTimeout(() => res(), 100000));
  });

  it("should start the application", async () => {
    const url = await app.getUrl();
    expect(url).toBeDefined();
  });

  it("should expose health endpoint", async () => {
    const res = await request("health");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });

  it("should expose Swagger JSON", async () => {
    const res = await request("api-json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const body = await res.json();
    expect(body).toHaveProperty("openapi");
  });

  it("should expose Swagger YAML", async () => {
    const res = await request("api-yaml");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(
      "text/yaml; charset=utf-8"
    );

    const text = await res.text();
    expect(typeof text).toBe("string");
    expect(text).toContain("openapi");
  });
});
