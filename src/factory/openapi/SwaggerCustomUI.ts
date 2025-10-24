import { SWAGGER_UI_CONSTANTS } from "./constants";
import { readFileSync } from "fs";
import * as path from "path";

export interface SwaggerUIOptions {
  title?: string;
  path?: string;
  persistAuthorization: boolean;
  assetsPath?: string;
  faviconPath?: string;
  topbarIconPath?: string;
  topbarBgColor?: string;
}

export class SwaggerCustomUI {
  readonly options: SwaggerUIOptions;
  // private readonly assetsPath: string = path.join(
  //   __dirname,
  //   "..",
  //   "..",
  //   "workdocs",
  //   "assets"
  // );

  constructor(options: SwaggerUIOptions) {
    this.options = {
      ...options,
    };
  }

  private customCSS() {
    let css = "";
    if (this.options.topbarIconPath) {
      const img = this.b64(this.options.topbarIconPath);
      css += `.topbar-wrapper { content: url('data:image/png;base64,${img}'); width: 200px; height: auto; }\n`;
    }
    return (
      css +
      `
        .topbar-wrapper svg { visibility: hidden; }
        .swagger-ui .topbar { background-color: ${this.options.topbarBgColor || SWAGGER_UI_CONSTANTS.topbarBgColor}; }
      `
    );
  }

  getCustomOptions() {
    const favicon: Record<string, any> = {};
    if (this.options.faviconPath) {
      favicon["customfavIcon"] = this.b64(this.options.faviconPath, true);
    }

    return {
      customSiteTitle: this.options.title,
      ...favicon,
      customCss: this.customCSS(),
      swaggerOptions: {
        persistAuthorization: this.options.persistAuthorization,
      },
      jsonDocumentUrl: this.options.path
        ? `${this.options.path}/spec.json`
        : undefined,
      yamlDocumentUrl: this.options.path
        ? `${this.options.path}/spec.yaml`
        : undefined,
    };
  }

  b64(file: string, img: boolean = false) {
    const filePath = path.join(this.options.assetsPath || "", file);
    const b64 = readFileSync(filePath, { encoding: "base64" });
    return img ? "data:image/png;base64," + b64 : b64;
  }
}
