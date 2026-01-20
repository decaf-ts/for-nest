import { DynamicModule, Module } from "@nestjs/common";
import { StreamController } from "./stream.controller";
import { RouterModule } from "@nestjs/core";
import { STREAM_FLAVOURS } from "./constant";
import { DecafRequestContext } from "../request/index";

@Module({})
export class DecafStreamModule {
  static forFlavours(
    flavours: string[],
    path: string = "events"
  ): DynamicModule {
    return {
      module: DecafStreamModule,
      controllers: [StreamController],
      imports: [
        RouterModule.register([
          {
            path: path.replace(/^\//, ""),
            module: DecafStreamModule,
          },
        ]),
      ],
      providers: [
        DecafRequestContext,
        {
          provide: STREAM_FLAVOURS,
          useValue: flavours ?? [],
        },
      ],
    };
  }
}
