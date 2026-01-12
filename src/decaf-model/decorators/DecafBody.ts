import {
  createParamDecorator,
  ExecutionContext,
  InternalServerErrorException,
} from "@nestjs/common";

/**
 * @description Custom decorator that extracts the request body and instantiates it using the Model constructor
 * found on the controller. Handles both single objects and arrays.
 */
export const DecafBody = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const body = request.body;

    // The DynamicModelController will have 'ModelConstr' available
    const controller = ctx.getClass();
    // We access the static property we will add to the DynamicModelController
    const ModelConstr = (controller as any).class;

    if (!ModelConstr) {
      throw new InternalServerErrorException(
        `ModelConstructor not found on controller ${controller.name}. Ensure the controller was created via FromModelController.`
      );
    }

    if (!body) return body;

    if (Array.isArray(body)) {
      return body.map((item) => new ModelConstr(item));
    }

    return new ModelConstr(body);
  }
);
