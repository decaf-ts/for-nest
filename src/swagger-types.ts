import { Type } from "@nestjs/common";

export interface SecuritySchemeObject {
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  description?: string;
  name?: string;
  in?: string;
  scheme?: string;
  bearerFormat?: string;
  flows?: Record<string, unknown>;
  openIdConnectUrl?: string;
  "x-tokenName"?: string;
  [extension: `x-${string}`]: unknown;
}

export interface SchemaObject {
  nullable?: boolean;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  default?: unknown;
  description?: string;
  type?: string;
  enum?: unknown[];
  pattern?: string;
  required?: string[];
  properties?: Record<string, SchemaObjectMetadata>;
  additionalProperties?: unknown;
  items?: unknown;
  format?: string;
  maximum?: number;
  minimum?: number;
  maxLength?: number;
  minLength?: number;
}

export interface ReferenceObject {
  $ref: string;
}

export type EnumAllowedTypes =
  | any[]
  | Record<string, any>
  | (() => any[] | Record<string, any>);

export type EnumSchemaAttributes = Pick<
  SchemaObject,
  | "default"
  | "description"
  | "deprecated"
  | "readOnly"
  | "writeOnly"
  | "nullable"
>;

type SchemaObjectCommonMetadata = Omit<
  SchemaObject,
  "type" | "required" | "properties" | "enum" | "pattern"
> & {
  isArray?: boolean;
  name?: string;
  pattern?: string | RegExp;
  enum?: EnumAllowedTypes;
  [key: string]: any;
  };

export type SchemaObjectMetadata =
  | (SchemaObjectCommonMetadata & {
      type?:
        | Type<unknown>
        | Function
        | [Function]
        | "array"
        | "string"
        | "number"
        | "boolean"
        | "integer"
        | "file"
        | "null";
      required?: boolean;
    })
  | (SchemaObjectCommonMetadata & {
      type?: Type<unknown> | Function | [Function] | Record<string, any>;
      required?: boolean;
      enumName: string;
      enumSchema?: EnumSchemaAttributes;
    })
  | (SchemaObjectCommonMetadata & {
      type: "object";
      properties: Record<string, SchemaObjectMetadata>;
      required?: string[];
      selfRequired?: boolean;
    })
  | (SchemaObjectCommonMetadata & {
      type: "object";
      properties?: Record<string, SchemaObjectMetadata>;
      additionalProperties: SchemaObject | ReferenceObject | boolean;
      required?: string[];
      selfRequired?: boolean;
    });

export type SwaggerEnumType =
  | string[]
  | number[]
  | boolean[]
  | (string | number | boolean)[]
  | Record<number, string>;
