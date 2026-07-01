import { Controller, Param, Post } from "@nestjs/common";
import { Repository, type Repo, OrderDirection } from "@decaf-ts/core";
import { DecafController } from "../controllers";
import { DecafRequestContext } from "../request";
import { DecafServerCtx } from "../constants";
import {
  WebhookDelivery,
  WebhookEventRecord,
  WebhookStatus,
  WebhookSubscription,
  collectPagedResults,
} from "@decaf-ts/for-http/hooks";

@Controller("webhook-subscriptions")
export class WebhookSubscriptionActionsController extends DecafController<DecafServerCtx> {
  constructor(clientContext: DecafRequestContext) {
    super(clientContext, WebhookSubscriptionActionsController.name);
  }

  @Post(":id/deactivate")
  async deactivate(@Param("id") id: string) {
    const { ctx } = (await this.logCtx([], "deactivate", true)).for(
      this.deactivate
    );
    const repo = Repository.forModel<
      WebhookSubscription,
      Repo<WebhookSubscription>
    >(WebhookSubscription);
    const current = await repo.read(id, ctx);
    current.active = false;
    return repo.update(current, ctx);
  }

  @Post(":id/reactivate")
  async reactivate(@Param("id") id: string) {
    const { ctx } = (await this.logCtx([], "reactivate", true)).for(
      this.reactivate
    );
    const repo = Repository.forModel<
      WebhookSubscription,
      Repo<WebhookSubscription>
    >(WebhookSubscription);
    const current = await repo.read(id, ctx);
    current.active = true;
    return repo.update(current, ctx);
  }
}

@Controller("webhook-events")
export class WebhookEventActionsController extends DecafController<DecafServerCtx> {
  constructor(clientContext: DecafRequestContext) {
    super(clientContext, WebhookEventActionsController.name);
  }

  @Post(":id/replay")
  async replay(@Param("id") id: string) {
    const { ctx } = (await this.logCtx([], "replay", true)).for(this.replay);
    const eventRepo = Repository.forModel<
      WebhookEventRecord,
      Repo<WebhookEventRecord>
    >(WebhookEventRecord);
    const deliveryRepo = Repository.forModel<
      WebhookDelivery,
      Repo<WebhookDelivery>
    >(WebhookDelivery);
    let event;
    try {
      event = await eventRepo.read(id, ctx);
    } catch (error) {
      const events = await eventRepo
        .select()
        .where(eventRepo.attr("id").eq(id))
        .limit(1)
        .execute(ctx);
      if (!events.length) throw error;
      event = events[0];
    }
    let deliveries: any[] = [];
    try {
      deliveries = await collectPagedResults(
        () =>
          deliveryRepo
            .select()
            .where(deliveryRepo.attr("eventId").eq(event.id))
            .orderBy("createdAt", OrderDirection.ASC)
            .thenBy("id", OrderDirection.ASC)
            .paginate(250, ctx),
        250,
        ctx
      );
    } catch {
      try {
        deliveries = await deliveryRepo
          .select()
          .where(deliveryRepo.attr("eventId").eq(event.id))
          .execute(ctx);
      } catch {
        deliveries = [];
      }
    }
    const now = new Date();

    for (const delivery of deliveries) {
      delivery.status = WebhookStatus.PENDING;
      delivery.attempts = 0;
      delivery.nextAttemptAt = now;
      delivery.lastAttemptAt = null as any;
      delivery.errorMessage = undefined;
      delivery.responseStatus = undefined;
      delivery.responseBody = undefined;
    }

    event.status = WebhookStatus.PENDING;
    event.deliveriesSucceeded = 0;
    event.deliveriesFailed = 0;
    event.nextAttemptAt = now;
    event.updatedAt = now;

    if (deliveries.length) {
      try {
        await deliveryRepo.updateAll(
          deliveries,
          ctx.override({ applyUpdateValidation: false } as any)
        );
      } catch {
        // Replay still resets the event state even if bulk delivery updates are not queryable here.
      }
    }
    return eventRepo.update(event, ctx);
  }
}
