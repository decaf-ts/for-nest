import { Injectable } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import {
  Adapter,
  column,
  pk,
  Repository as CoreRepository,
  Service as CoreService,
  ModelService,
  service,
} from "@decaf-ts/core";
import { RamAdapter, RamFlavour } from "@decaf-ts/core/ram";
import { Model, ModelArg, model, required } from "@decaf-ts/decorator-validation";
import { DecorationKeys, Metadata, uses } from "@decaf-ts/decoration";
import { RamTransformer } from "../../src/ram";
import { DecafModule } from "../../src/module";
import { Service, Repository } from "../../src/decorators";

RamAdapter.decoration();
Metadata.set(DecorationKeys.FLAVOUR, RamFlavour, []);
Model.setBuilder(Model.fromModel);
Adapter.setCurrent(RamFlavour);

@uses(RamFlavour)
@model()
class DecoratorWidget extends Model {
  @pk({ type: String, generated: false })
  id!: string;

  @column()
  @required()
  name!: string;

  constructor(arg?: ModelArg<DecoratorWidget>) {
    super(arg);
  }
}

@service()
class PlainWidgetService extends CoreService {
  constructor() {
    super();
  }

  ping(): string {
    return "pong";
  }
}

@Injectable()
class WidgetConsumer {
  constructor(
    @Repository(DecoratorWidget) public readonly repo: CoreRepository<
      DecoratorWidget,
      any
    >,
    @Service(DecoratorWidget) public readonly modelService: ModelService<DecoratorWidget>,
    @Service(PlainWidgetService) public readonly plainExplicit: PlainWidgetService,
    @Service() public readonly plainInferred: PlainWidgetService
  ) {}
}

describe("@Service()/@Repository() constructor parameter decorators", () => {
  let consumer: WidgetConsumer;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        await DecafModule.forRootAsync({
          conf: [[RamAdapter, {}, new RamTransformer()]],
          autoControllers: false,
          autoServices: false,
        }),
      ],
      providers: [WidgetConsumer],
    }).compile();

    consumer = moduleRef.get(WidgetConsumer);
  });

  it("injects a Repository<M> for @Repository(Model)", () => {
    expect(consumer.repo).toBeInstanceOf(CoreRepository);
    expect(consumer.repo).toBe(CoreRepository.forModel(DecoratorWidget));
  });

  it("injects a ModelService<M> for @Service(Model), distinct from @Repository(Model)", () => {
    expect(consumer.modelService).toBeInstanceOf(ModelService);
    expect(consumer.modelService.class).toBe(DecoratorWidget);
    expect(consumer.modelService).toBe(ModelService.forModel(DecoratorWidget));
    // same model class ("symbol"), but @Service and @Repository inject different objects
    expect(consumer.modelService).not.toBe(consumer.repo);
    // both ultimately share the same underlying repository singleton
    expect(consumer.modelService.repo).toBe(consumer.repo);
  });

  it("injects a plain decaf Service for @Service(SomeServiceClass)", () => {
    expect(consumer.plainExplicit).toBeInstanceOf(PlainWidgetService);
    expect(consumer.plainExplicit).toBe(CoreService.get(PlainWidgetService));
    expect(consumer.plainExplicit.ping()).toBe("pong");
  });

  it("infers the injection type for @Service() from the constructor parameter", () => {
    expect(consumer.plainInferred).toBe(consumer.plainExplicit);
  });

  it("performs real CRUD through the injected repository and model service", async () => {
    const created = await consumer.repo.create(
      new DecoratorWidget({ id: "widget-1", name: "first" })
    );
    expect(created.name).toBe("first");

    const read = await consumer.modelService.read("widget-1");
    expect(read.id).toBe("widget-1");
    expect(read.name).toBe("first");

    await consumer.repo.delete("widget-1");
  });
});
