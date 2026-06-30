import "../../src/decoration";
import "../../src/overrides";

import { Adapter } from "@decaf-ts/core";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { RequestMethod } from "@nestjs/common";
import { ModelControllerBuilder } from "@decaf-ts/for-http/server";
import { FromModelController } from "../../src/decaf-model/FromModelController";
import { ModelArg, model, required, Model } from "@decaf-ts/decorator-validation";
import { PreparedStatementKeys, column, pk, query, route, table } from "@decaf-ts/core";
import { Metadata } from "@decaf-ts/decoration";
import { Product } from "./Product";
import { ProductMarket } from "./ProductMarket";
import { BaseModel } from "@decaf-ts/core";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { BlockOperations, DBKeys } from "@decaf-ts/db-decorators";

RamAdapter.decoration();
Adapter.setCurrent(RamFlavour);
new RamAdapter();

function toVerb(method: RequestMethod | string): string {
  const map: Record<number, string> = {
    [RequestMethod.GET]: "GET",
    [RequestMethod.POST]: "POST",
    [RequestMethod.PUT]: "PUT",
    [RequestMethod.PATCH]: "PATCH",
    [RequestMethod.DELETE]: "DELETE",
  };
  return typeof method === "number" ? map[method] : method;
}

function normalizePath(path: string | undefined): string {
  return (path ?? "").replace(/^\/+|\/+$/g, "");
}

function controllerRoutes(controllerClass: any) {
  const proto = controllerClass.prototype;

  return Object.entries(Object.getOwnPropertyDescriptors(proto))
    .filter(([, descriptor]) => typeof descriptor.value === "function")
    .filter(([name]) => name !== "constructor")
    .map(([name, descriptor]) => {
      const path = normalizePath(
        Reflect.getMetadata(PATH_METADATA, descriptor.value as Function)
      );
      const method = toVerb(
        Reflect.getMetadata(METHOD_METADATA, descriptor.value as Function)
      );
      return {
        method,
        path,
      };
    })
    .filter((route) => route.method && route.path !== undefined)
    .sort((a, b) =>
      `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`)
    );
}

function builderRoutes(builder: any) {
  return (builder as any).controller.methods
    .map((route: any) => ({
      method: route.method,
      path: normalizePath(route.path),
    }))
    .sort((a: any, b: any) =>
      `${a.method}:${a.path}`.localeCompare(`${b.method}:${b.path}`)
    );
}

@table("parity-query-model")
@model()
class ParityQueryModel extends BaseModel {
  @pk()
  id!: string;

  @required()
  @column()
  name!: string;

  constructor(arg?: ModelArg<ParityQueryModel>) {
    super(arg);
  }
}

class ParityQueryRepository {
  class = ParityQueryModel;

  @route("GET", "metadata/for-product/:productCode")
  createMetadata(body: ParityQueryModel) {
    return body;
  }

  @query()
  findByName(name: string) {
    return name;
  }
}

@table("blocked_statement_model")
@model()
@BlockOperations([{ kind: "statement", value: PreparedStatementKeys.LIST_BY }])
class BlockedStatementModel extends BaseModel {
  @pk()
  id!: string;

  @required()
  @column()
  name!: string;

  constructor(arg?: ModelArg<BlockedStatementModel>) {
    super(arg);
  }
}

describe("Model controller builder parity", () => {
  it("matches the hard-coded Product controller route surface", () => {
    const hardcoded = FromModelController.create(Product);

    const builder = new ModelControllerBuilder(Product)
      .addCreateRoute()
      .addReadRoute()
      .addUpdateRoute()
      .addDeleteRoute()
      .addBulkCreateRoute()
      .addBulkReadRoute()
      .addBulkUpdateRoute()
      .addBulkDeleteRoute()
      .addStatementRoute()
      .addListByRoute()
      .addPaginateByRoute()
      .addFindRoute()
      .addPageRoute()
      .addFindOneByRoute()
      .addFindByRoute()
      .addGroupingQueryRoute();

    expect(builderRoutes(builder)).toEqual(controllerRoutes(hardcoded));
  });

  it("matches the hard-coded ProductMarket controller route surface for composed PKs", () => {
    const hardcoded = FromModelController.create(ProductMarket);

    const builder = new ModelControllerBuilder(ProductMarket)
      .addCreateRoute()
      .addReadRoute()
      .addUpdateRoute()
      .addDeleteRoute()
      .addBulkCreateRoute()
      .addBulkReadRoute()
      .addBulkUpdateRoute()
      .addBulkDeleteRoute()
      .addStatementRoute()
      .addListByRoute()
      .addPaginateByRoute()
      .addFindRoute()
      .addPageRoute()
      .addFindOneByRoute()
      .addFindByRoute()
      .addGroupingQueryRoute();

    // Match the factory: add composed PK fallback routes (filterEmpty)
    const pkName = Model.pk(ProductMarket) as string;
    const composed = Metadata.get(ProductMarket, Metadata.key(DBKeys.COMPOSED, pkName));
    const composedKeys = Array.isArray(composed?.args)
      ? Array.from(new Set(composed.args))
      : [];
    const canOmit = (name: string) =>
      composed?.filterEmpty === true
        ? true
        : Array.isArray(composed?.filterEmpty)
          ? composed.filterEmpty.includes(name)
          : false;
    const fallbackPaths = new Set<string>();
    const walkFallbacks = (index: number, current: string[]) => {
      if (index >= composedKeys.length) {
        if (current.length > 0) fallbackPaths.add(`:${current.join("/:")}`);
        return;
      }

      const segment = composedKeys[index];
      current.push(segment);
      walkFallbacks(index + 1, current);
      current.pop();

      if (canOmit(segment)) {
        walkFallbacks(index + 1, current);
      }
    };

    if (composedKeys.length > 1) {
      walkFallbacks(0, []);
      for (const fbPath of fallbackPaths) {
        if (fbPath !== `:${composedKeys.join("/:")}`) {
          builder.addReadRoute(fbPath).addUpdateRoute(fbPath).addDeleteRoute(fbPath);
        }
      }
    }

    const cr = controllerRoutes(hardcoded);
    const br = builderRoutes(builder);
    expect(br).toEqual(cr);
  });

  it("matches createQueryRoutesFromRepository() for decorated route/query methods", () => {
    const persistence = new ParityQueryRepository() as any;
    const hardcoded = FromModelController.createQueryRoutesFromRepository(
      persistence
    );

    const builder = new ModelControllerBuilder(ParityQueryModel)
      .addComplexQueries(persistence);

    expect(builderRoutes(builder)).toEqual(controllerRoutes(hardcoded));
  });

  it("hides statement-blocked query routes", () => {
    const controllerClass = FromModelController.create(BlockedStatementModel);
    const routes = controllerRoutes(controllerClass);

    expect(routes.some((route) => route.path === "listBy/:key")).toBe(false);
  });
});
