import { uses } from "@decaf-ts/decoration";
import { pk, table, column, createdAt, updatedAt } from "@decaf-ts/core";
// @ts-expect-error ram
import { RamFlavour } from "@decaf-ts/core/ram";
import {
  Model,
  model,
  ModelArg,
  required,
  minlength,
  maxlength,
  min,
  max,
} from "@decaf-ts/decorator-validation";

/**
 * Test model to verify DtoFor function properly handles:
 * - Generated properties (should be excluded from CREATE DTOs)
 * - Required properties (should be in the `required` array in OpenAPI)
 * - Optional properties (should NOT be in the `required` array)
 * - Decorator order should not matter for required status
 */
@uses(RamFlavour)
@table("test_dto")
@model()
export class TestDtoModel extends Model {
  // Generated PK - should be excluded from CREATE DTO
  @pk({ type: String, generated: true })
  id!: string;

  // Required with no other decorators
  @column()
  @required()
  simpleRequired!: string;

  // Required with decorators BEFORE @required()
  @column()
  @minlength(1)
  @maxlength(100)
  @required()
  requiredWithValidationBefore!: string;

  // Required with decorators AFTER @required()
  @column()
  @required()
  @minlength(1)
  @maxlength(100)
  requiredWithValidationAfter!: string;

  // Required with decorators AROUND @required()
  @column()
  @min(0)
  @required()
  @max(100)
  requiredWithValidationAround!: number;

  // Optional - no @required() decorator
  @column()
  optionalNoValidation?: string;

  // Optional with validation decorators
  @column()
  @minlength(1)
  @maxlength(50)
  optionalWithValidation?: string;

  // Generated timestamp - should be excluded from CREATE DTO
  @createdAt()
  createdAt!: Date;

  // Generated timestamp - should be excluded from CREATE DTO
  @updatedAt()
  updatedAt!: Date;

  constructor(model?: ModelArg<TestDtoModel>) {
    super(model);
  }
}
