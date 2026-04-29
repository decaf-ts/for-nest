import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { SwaggerCustomUI } from "./SwaggerCustomUI";
import { SWAGGER_UI_CONSTANTS, SwaggerOptions } from "./constants";
import YAML from "yaml";

export class SwaggerBuilder {
  constructor(
    private readonly app: INestApplication,
    private readonly options: SwaggerOptions
  ) {}

  private createDocument() {
    const description = this.options.path
      ? this.options.description +
        "" +
        `<br><br><a href="${this.options.openApiJsonPath}">OpenAPI JSON Spec</a> | ` +
        `<a href="${this.options.openApiYamlPath}">OpenAPI YAML Spec</a>`
      : this.options.description;

    const config = new DocumentBuilder()
      .setTitle(this.options.title)
      .setDescription(description)
      .setVersion(this.options.version || "0.0.1")
      .addBearerAuth(this.options.auth || SWAGGER_UI_CONSTANTS.auth)
      .build();

    return SwaggerModule.createDocument(this.app, config, {
      extraModels: this.options.extraModels || [],
    });
  }

  private registerOpenApiRoute(
    path: string | undefined,
    contentType: "application/json" | "application/x-yaml",
    bodyFactory: () => void
  ): void {
    if (!path) return;

    const httpAdapter = this.app.getHttpAdapter();
    path = path.startsWith("/") ? path : `/${path}`;
    httpAdapter.get(path, (_req, res) => {
      httpAdapter.reply(res, bodyFactory(), 200, {
        "Content-Type": contentType,
      });
    });
  }

  public setupSwagger() {
    const document = this.createDocument();
    const swaggerUI = new SwaggerCustomUI({
      title: this.options.title,
      path: this.options.path || SWAGGER_UI_CONSTANTS.path,
      persistAuthorization: this.options.persistAuthorization ?? true,
      assetsPath: this.options.assetsPath,
      faviconPath: this.options.faviconFilePath,
      topbarIconPath: this.options.topbarIconFilePath,
      topbarBgColor: this.options.topbarBgColor,
    });
    SwaggerModule.setup(
      this.options.path || SWAGGER_UI_CONSTANTS.path,
      this.app,
      document,
      {
        ...swaggerUI.getCustomOptions(),
        jsonDocumentUrl: this.options.openApiJsonPath
          ? `${this.options.openApiJsonPath}`
          : undefined,
        yamlDocumentUrl: this.options.openApiYamlPath
          ? `${this.options.openApiYamlPath}`
          : undefined,
      }
    );

    this.registerOpenApiRoute(
      this.options.openApiJsonPath,
      "application/json",
      () => document
    );

    this.registerOpenApiRoute(
      this.options.openApiYamlPath,
      "application/x-yaml",
      () => YAML.stringify(document)
    );
  }

  // private getVersion() {
  //   // const packageJson = path.join(__dirname, "..", "..", "package.json");
  //   // const {version} = require(packageJson);
  //   return "version";
  // }
}
