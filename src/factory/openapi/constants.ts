import { SecuritySchemeObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { Constructor } from "@decaf-ts/decoration";

export interface SwaggerOptions {
  title: string;
  description: string;
  version?: string;
  assetsPath?: string;
  faviconFilePath?: string;
  topbarIconFilePath?: string;
  persistAuthorization?: boolean;
  path: string;
  auth?: SecuritySchemeObject;
  topbarBgColor?: string;
  extraModels?: Constructor[];
}

export const SWAGGER_UI_CONSTANTS: SwaggerOptions = {
  title: "Swagger | OpenAPI Specification (OAS)",
  description: "Standardized format for describing RESTful APIs",
  version: "0.0.1",
  path: "docs",
  faviconFilePath: "",
  topbarIconFilePath: "",
  auth: {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    name: "Authorization",
    description: "Enter JWT token",
    in: "header",
  },
  persistAuthorization: true,
  topbarBgColor: "#000000",
};
