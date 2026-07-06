import "../../src/decoration";
import "../../src/overrides";

import { Context, Service, pk, table } from "@decaf-ts/core";
import { model, Model } from "@decaf-ts/decorator-validation";
import { DecafModelController } from "../../src/controllers";
import { DecafRequestContext } from "../../src/request/DecafRequestContext";

@table("controller_persistence_binding")
@model()
class ControllerPersistenceBindingModel extends Model {
  @pk()
  id!: string;

  constructor() {
    super();
  }
}

class ControllerPersistenceBindingController extends DecafModelController<ControllerPersistenceBindingModel> {
  override get class() {
    return ControllerPersistenceBindingModel;
  }

  constructor(ctx: DecafRequestContext) {
    super(ctx, "ControllerPersistenceBindingController");
  }
}

describe("DecafModelController persistence binding", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("binds the runtime ctx overrides instead of the constructor context overrides", () => {
    const fakePersistence = {
      for: jest.fn().mockReturnThis(),
      override: jest.fn().mockReturnThis(),
    };
    const serviceSpy = jest.spyOn(Service, "get").mockReturnValue(fakePersistence as any);

    const clientOverrides = { source: "client" };
    const requestOverrides = { source: "request" };

    const controller = new ControllerPersistenceBindingController({
      toOverrides: () => clientOverrides,
    } as unknown as DecafRequestContext);

    const result = controller.persistence({
      toOverrides: () => requestOverrides,
    } as unknown as Context<any>);

    expect(serviceSpy).toHaveBeenCalled();
    expect(fakePersistence.for).toHaveBeenCalledWith(requestOverrides);
    expect(fakePersistence.override).not.toHaveBeenCalled();
    expect(result).toBe(fakePersistence);
  });
});
