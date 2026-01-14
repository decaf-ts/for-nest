import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { DecafParamProps, DecafApiProperty } from "./types";
/**
 * @description Creates a custom NestJS parameter decorator that extracts and returns route parameters ordered by a specific key sequence.
 * @summary The `OrderedParams` decorator reads the incoming HTTP request's `params` object, optionally orders it according to a provided list of parameter names, and returns an object containing the original params, the ordered values, and the applied order list. This ensures deterministic parameter access for routes with multiple path parameters.
 * @template {string[]} TOrder - Represents the expected sequence of parameter names.
 * @param {TOrder | undefined} order An optional array specifying the parameter names' desired order. If not provided, the decorator will preserve the order of the keys as they appear in the original `req.params` object.
 * @param {ExecutionContext} ctx The NestJS execution context, used to retrieve the current HTTP request object.
 * @return {DecafParamProps} An object containing:
 * - `original`: the raw parameter map from `req.params`;
 * - `ordered`: an array of parameter values in the requested order;
 * - `order`: the effective order list used.
 * @function OrderedParams
 */
const OrderedParams = createParamDecorator(
  (order: string[] | undefined, ctx: ExecutionContext): DecafParamProps => {
    const req = ctx.switchToHttp().getRequest();
    const original = (req?.params ?? {}) as Record<string, any>;
    const orderList = order ?? Object.keys(original);
    const ordered = orderList.map((k) => original[k]);
    return { raw: original, valuesInOrder: ordered, keysInOrder: orderList };
  }
);

/**
 * @description A higher-level decorator factory that leverages `OrderedParams` to extract route parameters in a specific order derived from a list of `ApiParam` definitions.
 * @summary `DecafParams` computes the order of route parameters based on the provided `ApiParam[]` specification (using each element’s `name`), then applies `OrderedParams(order)` as a parameter decorator. This enables parameter-level binding that remains consistent with the documented API parameter metadata.
 * @param {ApiParam[]} [props=[]] Array of `ApiParam` definitions whose `name` fields determine the parameter extraction order.
 * @return {ParameterDecorator} A NestJS parameter decorator that injects an ordered list of parameters and metadata into the controller method argument.
 */
export function DecafParams(
  props: DecafApiProperty[] = []
): ParameterDecorator {
  const order = props.map((p) => p.name);
  return OrderedParams(order);
}

export const DecafQuery = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    const query = req.query ?? {};

    const parsed: any = { ...query };

    // Parse limit & offset
    if (parsed.limit !== undefined) {
      const n = Number(parsed.limit);
      if (!Number.isNaN(n)) parsed.limit = n;
    }

    if (parsed.offset !== undefined) {
      const n = Number(parsed.offset);
      if (!Number.isNaN(n)) parsed.offset = n;
    }

    // Parse bookmark only if numeric
    if (parsed.bookmark !== undefined) {
      const n = Number(parsed.bookmark);
      parsed.bookmark = Number.isNaN(n) ? parsed.bookmark : n;
    }

    return parsed;
  }
);
