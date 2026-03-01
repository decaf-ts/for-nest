import { model, Model } from "@decaf-ts/decorator-validation";
import {
  column,
  createdAt,
  createdBy,
  pk,
  updatedAt,
  updatedBy,
} from "@decaf-ts/core";
import { version } from "@decaf-ts/db-decorators";

@model()
export class DeepAuditRoot extends Model {
  @column()
  @version()
  version!: number;

  @column()
  @createdAt()
  createdAt!: Date;

  @column()
  @updatedAt()
  updatedAt!: Date;
}

@model()
export class DeepOwnedModel extends DeepAuditRoot {
  @column()
  @createdBy()
  createdBy!: string;

  @column()
  @updatedBy()
  updatedBy!: string;
}

@model()
export class MultiLevelGeneratedModel extends DeepOwnedModel {
  @pk()
  @column()
  multiId!: string;

  @column()
  multiName!: string;

  @column()
  multiFlag?: boolean;
}
