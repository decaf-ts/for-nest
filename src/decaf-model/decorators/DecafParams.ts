import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { DecafParamProps, ApiParam } from "./types";

const OrderedParams = createParamDecorator(
  (order: string[] | undefined, ctx: ExecutionContext): DecafParamProps => {
    const req = ctx.switchToHttp().getRequest();
    const original = (req?.params ?? {}) as Record<string, any>;
    const orderList = order ?? Object.keys(original);
    const ordered = orderList.map((k) => original[k]);
    return { original, ordered, order: orderList };
  }
);

export function DecafParams(props: ApiParam[] = []): ParameterDecorator {
  const order = props.map((p) => p.name);
  return OrderedParams(order);
}
