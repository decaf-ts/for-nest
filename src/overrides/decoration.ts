import { Type } from "@nestjs/common";
import type { EnumSchemaAttributes } from "@nestjs/swagger/dist/interfaces/enum-schema-attributes.interface";
import type {
  EnumAllowedTypes,
  SchemaObjectMetadata,
} from "@nestjs/swagger/dist/interfaces/schema-object-metadata.interface";
import { isString, negate, pickBy } from "lodash";
import { DECORATORS } from "./constants";
import { getTypeIsArrayTuple, METADATA_FACTORY_NAME } from "./helpers";
import { type SwaggerEnumType } from "@nestjs/swagger/dist/types/swagger-enum.type";

export const isUndefined = (obj: any): obj is undefined =>
  typeof obj === "undefined";

export function getEnumValues(
  enumType: SwaggerEnumType | (() => SwaggerEnumType)
): string[] | number[] {
  if (typeof enumType === "function") {
    return getEnumValues(enumType());
  }

  if (Array.isArray(enumType)) {
    return enumType as string[];
  }
  if (typeof enumType !== "object") {
    return [];
  }
  // Enums with numeric values
  //   enum Size {
  //     SMALL = 1,
  //     BIG = 2
  //   }
  // are transpiled to include a reverse mapping
  //   const Size = {
  //     "1": "SMALL",
  //     "2": "BIG",
  //     "SMALL": 1,
  //     "BIG": 2,
  //   }
  const numericValues = Object.values(enumType)
    .filter((value) => typeof value === "number")
    .map((value: any) => value.toString());

  return Object.keys(enumType)
    .filter((key) => !numericValues.includes(key))
    .map((key) => enumType[key as any]);
}

export function getEnumType(values: (string | number)[]): "string" | "number" {
  const hasString = values.filter(isString).length > 0;
  return hasString ? "string" : "number";
}

export function createPropertyDecorator<T extends Record<string, any> = any>(
  metakey: string,
  metadata: T,
  overrideExisting = true
): PropertyDecorator {
  return ((target: object, propertyKey: string) => {
    const properties =
      Reflect.getMetadata(DECORATORS.API_MODEL_PROPERTIES_ARRAY, target) || [];

    const key = `:${propertyKey}`;
    if (!properties.includes(key)) {
      Reflect.defineMetadata(
        DECORATORS.API_MODEL_PROPERTIES_ARRAY,
        [...properties, `:${propertyKey}`],
        target
      );
    }
    const existingMetadata = Reflect.getMetadata(metakey, target, propertyKey);
    if (existingMetadata) {
      const newMetadata = pickBy(metadata, negate(isUndefined));
      const metadataToSave = overrideExisting
        ? {
            ...existingMetadata,
            ...newMetadata,
          }
        : {
            ...newMetadata,
            ...existingMetadata,
          };

      Reflect.defineMetadata(metakey, metadataToSave, target, propertyKey);
    } else {
      const type =
        // @ts-expect-error nest js code
        target?.constructor?.[METADATA_FACTORY_NAME]?.()[propertyKey]?.type ??
        Reflect.getMetadata("design:type", target, propertyKey);

      Reflect.defineMetadata(
        metakey,
        {
          type,
          ...pickBy(metadata, negate(isUndefined)),
        },
        target,
        propertyKey
      );
    }
  }) as PropertyDecorator;
}

export type ApiPropertyCommonOptions = SchemaObjectMetadata & {
  "x-enumNames"?: string[];
  /**
   * Lazy function returning the type for which the decorated property
   * can be used as an id
   *
   * Use together with @ApiDefaultGetter on the getter route of the type
   * to generate OpenAPI link objects
   *
   * @see [Swagger link objects](https://swagger.io/docs/specification/links/)
   */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  link?: () => Type<unknown> | Function;
};

export type ApiPropertyOptions =
  | ApiPropertyCommonOptions
  | (ApiPropertyCommonOptions & {
      enumName: string;
      enumSchema?: EnumSchemaAttributes;
    });

const isEnumArray = (
  opts: ApiPropertyOptions
): opts is {
  isArray: true;
  enum: EnumAllowedTypes;
  type: any;
  items: any;
} => (opts.isArray && "enum" in opts && opts.enum !== undefined) as boolean;

/**
 * @publicApi
 */
export function ApiProperty(
  options: ApiPropertyOptions = {}
): PropertyDecorator {
  return createApiPropertyDecorator(options);
}

export function createApiPropertyDecorator(
  options: ApiPropertyOptions = {},
  overrideExisting = true
): PropertyDecorator {
  const [type, isArray] = getTypeIsArrayTuple(
    options.type,
    options.isArray as any
  );
  options = {
    ...options,
    type,
    isArray,
  } as ApiPropertyOptions;

  if (isEnumArray(options)) {
    options.type = "array";

    const enumValues = getEnumValues(options.enum);
    options.items = {
      type: getEnumType(enumValues),
      enum: enumValues,
    };
    // @ts-expect-error nest js code
    delete options.enum;
  } else if ("enum" in options && options.enum !== undefined) {
    const enumValues = getEnumValues(options.enum);

    options.enum = enumValues;
    options.type = getEnumType(enumValues);
  }

  if (Array.isArray(options.type)) {
    options.type = "array";
    options.items = {
      type: "array",
      items: {
        type: options.type[0],
      },
    };
  }

  return createPropertyDecorator(
    DECORATORS.API_MODEL_PROPERTIES,
    options,
    overrideExisting
  );
}
