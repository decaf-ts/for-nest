import "../../src/decoration";
import "../../src/overrides";

import {
  Adapter,
  Context,
  OrderDirection,
  Repository,
  defaultQueryAttr,
  pk,
} from "@decaf-ts/core";
import { OperationKeys } from "@decaf-ts/db-decorators";
import { Logging } from "@decaf-ts/logging";
import { DecafRequestContext } from "../../src/request/DecafRequestContext";
import { FromModelController } from "../../src/decaf-model/FromModelController";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { model, Model, ModelArg, required } from "@decaf-ts/decorator-validation";
import { uses } from "@decaf-ts/decoration";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
const ramAdapter = new RamAdapter();

@uses("ram")
@model()
class NumericSearchModel extends Model {
  @pk()
  id!: string;

  @required()
  @defaultQueryAttr()
  searchName!: string;

  @required()
  @defaultQueryAttr()
  searchCode!: string;

  constructor(arg?: ModelArg<NumericSearchModel>) {
    super(arg);
  }
}

function makeContext(operation: OperationKeys): Context {
  return new Context().accumulate({
    logger: Logging.get(),
    operation,
    headers: {},
    overrides: {},
  } as any);
}

function makeRequestContext(operation: OperationKeys): DecafRequestContext {
  const ctx = makeContext(operation);
  const requestContext = new DecafRequestContext({} as any);
  requestContext.applyCtx(ctx);
  return requestContext;
}

describe("DecafModelController find/page via default query attributes", () => {
  let repo: Repository<NumericSearchModel>;

  beforeAll(async () => {
    repo = Repository.forModel(NumericSearchModel);
    const creationCtx = makeContext(OperationKeys.CREATE);
    const models = [
      new NumericSearchModel({ id: "1", searchName: "1Alpha", searchCode: "1-A" }),
      new NumericSearchModel({ id: "2", searchName: "1Beta", searchCode: "1-B" }),
      new NumericSearchModel({ id: "3", searchName: "a1-Gamma", searchCode: "1-G" }),
      new NumericSearchModel({ id: "4", searchName: "10Start", searchCode: "10-S" }),
      new NumericSearchModel({ id: "5", searchName: "foo10", searchCode: "10-F" }),
    ];
    await repo.createAll(models, creationCtx);
  });

  it("exposes decorator-backed query searches for strings with digits", async () => {
    const controllerClass = FromModelController.create(NumericSearchModel);
    const controller = new controllerClass(makeRequestContext(OperationKeys.READ));

    const matching = await controller.find("1", { direction: OrderDirection.ASC });
    expect(matching.length).toBeGreaterThan(0);
    expect(matching.every((record) => record.searchName.startsWith("1") || record.searchCode.startsWith("1"))).toBe(true);
    expect(matching.map((record) => record.searchName).some((name) => name === "10Start")).toBe(true);
  });

  it("pages through matching results and honors bookmark metadata", async () => {
    const controllerClass = FromModelController.create(NumericSearchModel);
    const controller = new controllerClass(makeRequestContext(OperationKeys.READ));

    const firstPage = await controller.page("1", {
      direction: OrderDirection.ASC,
      limit: 2,
      offset: 1,
    });
    expect(firstPage.data.length).toBe(2);
    expect(firstPage.current).toBe(1);
    expect(firstPage.bookmark).toBeDefined();

    const secondController = new controllerClass(makeRequestContext(OperationKeys.READ));
    const secondPage = await secondController.page("1", {
      direction: OrderDirection.ASC,
      limit: 2,
      bookmark: firstPage.bookmark,
    });
    expect(secondPage.data.length).toBeGreaterThan(0);
    expect(secondPage.bookmark).toBeDefined();
    expect(secondPage.current).toBe(firstPage.current);
  });
});
