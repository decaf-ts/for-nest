import { applyDecorators } from "@nestjs/common";
import { ApiParam as ApiParamDec } from "@nestjs/swagger";
import { ApiParam } from "./types";

/**
 * @description Applies a set of Swagger `@ApiParam` decorators generated from a typed specification array.
 * @summary Transforms each entry of the provided `ApiParam[]` into a corresponding `@ApiParam()` decorator (defaulting `description`, `required`, and `type` when omitted) and composes them into a single decorator via Nest's `applyDecorators`. Useful for synchronizing runtime route params with OpenAPI documentation in a concise, declarative way.
 * @param {ApiParam[]} [props=[]] Array describing path parameters to be documented.
 * @param {string} props[].name The parameter's name as it appears in the route template (e.g., `:id`).
 * @param {string} [props[].description] Human-readable explanation of the parameter; defaults to `"Path parameter: <name>"`.
 * @param {boolean} [props[].required=true] Whether the parameter is required; defaults to `true`.
 * @param {Constructor<any>} [props[].type=String] Constructor/type used by Swagger to infer schema (e.g., `String`, `Number`, `UUID`, custom class).
 * @return {any} A composed decorator applying all generated `@ApiParam` decorators to the target method or controller.
 * @function ApiParamsFromModel
 */
export function ApiParamsFromModel(
  props: ApiParam[] = []
): MethodDecorator & ClassDecorator {
  const decorators = props.map((p) =>
    ApiParamDec({
      name: p.name,
      description: p.description ?? `Path parameter: ${p.name}`,
      required: p.required ?? true,
      // schema: { type: 'string' },
      type: p.type ?? String,
    })
  );
  return applyDecorators(...decorators);
}
