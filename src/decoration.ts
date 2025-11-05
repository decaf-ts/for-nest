import {
  InjectableConfig,
  InjectablesKeys,
  InjectOptions,
} from "@decaf-ts/injectable-decorators";
import { Inject, Injectable, Scope } from "@nestjs/common";
import { Constructor, Decoration, DecorationKeys } from "@decaf-ts/decoration";
import { ValidationKeys } from "@decaf-ts/decorator-validation";
import { PersistenceKeys } from "@decaf-ts/core";
import { ApiProperty } from "@nestjs/swagger";

Decoration.for(InjectablesKeys.INJECTABLE)
  .extend({
    decorator: function nestInjectable(
      category: string | Constructor,
      cfg: InjectableConfig
    ) {
      return Injectable({
        scope: cfg.singleton ? Scope.DEFAULT : Scope.REQUEST,
        durable: cfg.singleton ? undefined : true,
      });
    },
  })
  .apply();

Decoration.for(InjectablesKeys.INJECT)
  .extend({
    decorator: function nestInject(
      category: symbol | string | Constructor,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      cfg: InjectOptions
    ) {
      return function innerNestInject(
        target: object,
        propertyKey?: any,
        descriptor?: any
      ) {
        return Inject(category || (target as Constructor))(
          target,
          propertyKey,
          descriptor
        );
      };
    },
  })
  .apply();

Decoration.for(ValidationKeys.REQUIRED)
  .extend(
    ApiProperty({
      required: true,
    })
  )
  .apply();

Decoration.for(ValidationKeys.MAX)
  .extend({
    decorator: function maxDec(max: number) {
      return ApiProperty({ maximum: max });
    },
  })
  .apply();

Decoration.for(ValidationKeys.MIN)
  .extend({
    decorator: function minDec(min: number) {
      return ApiProperty({ minimum: min });
    },
  })
  .apply();

Decoration.for(ValidationKeys.MAX_LENGTH)
  .extend({
    decorator: function maxLengthDec(max: number) {
      return ApiProperty({ maxLength: max });
    },
  })
  .apply();

Decoration.for(ValidationKeys.MIN_LENGTH)
  .extend({
    decorator: function minLengthDec(min: number) {
      return ApiProperty({ minLength: min });
    },
  })
  .apply();
//
// Decoration.for(ValidationKeys.TYPE)
//   .extend({
//     decorator: function typeDec(type: (string | (() => string))[] | string | (() => string)) {
//       return ApiProperty({ type: type as any });
//     },
//   })
//   .apply();
//
// Decoration.for(ValidationKeys.DATE)
//   .extend({
//     decorator: function dateDec() {
//       return ApiProperty({ type: Date });
//     },
//   })
//   .apply();

Decoration.for(ValidationKeys.LIST)
  .extend({
    decorator: function listDec(
      clazz:
        | Constructor<any>
        | (() => Constructor<any>)
        | (Constructor<any> | (() => Constructor<any>))[]
    ) {
      const c = Array.isArray(clazz) ? clazz[0] : clazz;
      return ApiProperty({ type: [c] });
    },
  })
  .apply();

//
// Decoration.for(ValidationKeys.OPTION)
//   .extend({
//     decorator: function optionDec(options: string[] | Record<string, any>) {
//       const opts = Array.isArray(options) ? options : Object.values(options);
//       return ApiProperty({ enum: opts });
//     },
//   })
//   .apply();

Decoration.for(ValidationKeys.PATTERN)
  .extend({
    decorator: function patternDec(pat: RegExp | string) {
      return ApiProperty({
        pattern: typeof pat === "string" ? pat : pat.source,
      });
    },
  })
  .apply();

Decoration.for(PersistenceKeys.COLUMN)
  .extend({
    decorator: function columnDec(name: string) {
      return ApiProperty({
        name: name,
      });
    },
  })
  .apply();

Decoration.for(DecorationKeys.DESCRIPTION)
  .extend({
    decorator: function descriptionDec(description: string) {
      return ApiProperty({
        description: description,
      });
    },
  })
  .apply();
