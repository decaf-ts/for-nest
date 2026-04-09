import { model, Model } from "@decaf-ts/decorator-validation";
import {
  column,
  createdAt,
  createdBy,
  pk,
  updatedAt,
  updatedBy,
} from "@decaf-ts/core";
import { generated, version, DBKeys } from "@decaf-ts/db-decorators";
import { Metadata } from "@decaf-ts/decoration";

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
  @generated()
  @pk()
  @column()
  multiId!: number;

  @column()
  multiName!: string;

  @column()
  multiFlag?: boolean;
}
Metadata.set(
  MultiLevelGeneratedModel,
  Metadata.key(DBKeys.ID, "multiId"),
  { generated: true, type: Number }
);
Metadata.set(
  MultiLevelGeneratedModel,
  Metadata.key(DBKeys.GENERATED, "multiId"),
  true
);
