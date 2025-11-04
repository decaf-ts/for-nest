import { applyDecorators } from "@nestjs/common";
import { ApiParam as ApiParamDec } from "@nestjs/swagger";
import { ApiParam } from "./types";

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
