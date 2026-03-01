import {
  Body,
  Controller,
  Module,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import { ApiBody } from "@nestjs/swagger";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Adapter } from "@decaf-ts/core";
import {
  RamAdapter,
  RamFlavour,
  // @ts-expect-error import from ram
} from "@decaf-ts/core/ram";
import { DtoFor } from "../../src/factory/openapi/DtoBuilder";
import { Product } from "./Product";
import { MultiLevelGeneratedModel } from "./MultiLevelGeneratedModel";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);

export const CreateDTO = DtoFor(OperationKeys.CREATE, Product);
export const UpdateDTO = DtoFor(OperationKeys.UPDATE, Product);
export const MultiLevelCreateDTO = DtoFor(
  OperationKeys.CREATE,
  MultiLevelGeneratedModel
);
export const MultiLevelUpdateDTO = DtoFor(
  OperationKeys.UPDATE,
  MultiLevelGeneratedModel
);

@Controller("dto-for-test")
class TestDtoController {
  @Post("create")
  @ApiBody({ type: CreateDTO })
  create(@Body() body: InstanceType<typeof CreateDTO>) {
    return body;
  }

  @Put("update")
  @ApiBody({ type: UpdateDTO })
  update(@Body() body: InstanceType<typeof UpdateDTO>) {
    return body;
  }
}

@Controller("multi-level-dto")
class MultiLevelDtoController {
  @Post("create")
  @ApiBody({ type: MultiLevelCreateDTO })
  create(@Body() body: InstanceType<typeof MultiLevelCreateDTO>) {
    return body;
  }

  @Put("update/:id")
  @ApiBody({ type: MultiLevelUpdateDTO })
  update(
    @Param("id") id: string,
    @Body() body: InstanceType<typeof MultiLevelUpdateDTO>
  ) {
    return body;
  }
}

@Module({
  controllers: [TestDtoController, MultiLevelDtoController],
})
export class DtoSwaggerModule {}
