import fs from "fs";
import path from "path";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { NestFactory } from "@nestjs/core";
import {
  DtoSwaggerModule,
  CreateDTO,
  MultiLevelCreateDTO,
} from "../tests/unit/dto-swagger-app.ts";

async function main() {
  const title = "Product DTO Swagger";
  const description = "Product DTO Swagger routes";
  const version = "1.0";
  const documentProps = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion(version)
    .build();

  const app = await NestFactory.create(DtoSwaggerModule, { logger: false });
  await app.init();
  const document = SwaggerModule.createDocument(app, documentProps);
  const outDir = path.resolve("workdocs/resources");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "product-swagger.json");
  fs.writeFileSync(outPath, JSON.stringify(document, null, 2), "utf8");
  await app.close();
  console.log(`Product swagger written to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
