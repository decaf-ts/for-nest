import "../src/decoration";
import "../src/overrides";

import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { NestFactory } from "@nestjs/core";
import {
  DecafExceptionFilter,
  DecafModule,
  // RamTransformer,
} from "../src/index";
// @ts-expect-error path
import { RamAdapter } from "@decaf-ts/core/ram";

export async function getApp() {
  const config = new DocumentBuilder()
    .setTitle("Cats example")
    .setDescription("The cats API description")
    .setVersion("1.0")
    .addTag("cats")
    .build();
  const app = await NestFactory.create(
    DecafModule.forRootAsync({
      conf: [[RamAdapter, {}]],
      autoControllers: true,
      autoServices: false,
    })
  );
  // const app = await NestFactory.create(
  //   DecafModule.forRootAsync({
  //     conf: [[RamAdapter, {}, new RamTransformer()]],
  //     autoControllers: true,
  //     autoServices: false,
  //   })
  // );
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, documentFactory);

  app.useGlobalFilters(new DecafExceptionFilter());
  await app.init();
  return app;
}
