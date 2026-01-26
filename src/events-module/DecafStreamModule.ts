import { DynamicModule, Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { RouterModule } from "@nestjs/core";
import { LISTENING_ADAPTERS_FLAVOURS } from "./constant";
import { DecafRequestContext } from "../request/index";

@Module({})
export class DecafStreamModule {
  static forFlavours(
    flavours: string[],
    path: string = "events"
  ): DynamicModule {
    return {
      module: DecafStreamModule,
      controllers: [EventsController],
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
          provide: LISTENING_ADAPTERS_FLAVOURS,
          useValue: flavours ?? [],
        },
      ],
    };
  }
}
