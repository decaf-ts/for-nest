import { FromModelController } from "../../src/decaf-model";
import {
  DecafWebhookModule,
  WebhookEventActionsController,
  WebhookSubscriptionActionsController,
} from "../../src/webhooks";

describe("DecafWebhookModule", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("exposes webhook controllers as an optional standalone module", async () => {
    const createSpy = jest
      .spyOn(FromModelController, "create")
      .mockImplementation(() => class {} as any);
    jest
      .spyOn(DecafWebhookModule, "bootPersistence")
      .mockResolvedValue([{ flavour: "nano", alias: "webhooks" } as any]);

    const module = await DecafWebhookModule.forRootAsync({
      conf: [] as any,
      autoControllers: false as any,
      webhookApiPath: "webhooks",
    } as any);

    expect(module.module).toBe(DecafWebhookModule);
    expect(module.controllers).toHaveLength(5);
    expect(module.controllers).toEqual(
      expect.arrayContaining([
        WebhookSubscriptionActionsController,
        WebhookEventActionsController,
      ])
    );
    expect(createSpy).toHaveBeenCalledTimes(3);
  });
});
