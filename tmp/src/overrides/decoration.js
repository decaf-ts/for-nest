"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUndefined = void 0;
exports.getEnumValues = getEnumValues;
exports.getEnumType = getEnumType;
exports.createPropertyDecorator = createPropertyDecorator;
exports.ApiProperty = ApiProperty;
exports.createApiPropertyDecorator = createApiPropertyDecorator;
const lodash_1 = require("lodash");
const constants_1 = require("./constants");
const helpers_1 = require("./helpers");
const isUndefined = (obj) => typeof obj === "undefined";
exports.isUndefined = isUndefined;
function getEnumValues(enumType) {
    if (typeof enumType === "function") {
        return getEnumValues(enumType());
    }
    if (Array.isArray(enumType)) {
        return enumType;
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
        .map((value) => value.toString());
    return Object.keys(enumType)
        .filter((key) => !numericValues.includes(key))
        .map((key) => enumType[key]);
}
function getEnumType(values) {
    const hasString = values.filter(lodash_1.isString).length > 0;
    return hasString ? "string" : "number";
}
function createPropertyDecorator(metakey, metadata, overrideExisting = true) {
    return ((target, propertyKey) => {
        const properties = Reflect.getMetadata(constants_1.DECORATORS.API_MODEL_PROPERTIES_ARRAY, target) || [];
        const key = `:${propertyKey}`;
        if (!properties.includes(key)) {
            Reflect.defineMetadata(constants_1.DECORATORS.API_MODEL_PROPERTIES_ARRAY, [...properties, `:${propertyKey}`], target);
        }
        const existingMetadata = Reflect.getMetadata(metakey, target, propertyKey);
        if (existingMetadata) {
            const newMetadata = (0, lodash_1.pickBy)(metadata, (0, lodash_1.negate)(exports.isUndefined));
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
        }
        else {
            const type = 
            // @ts-expect-error nest js code
            target?.constructor?.[helpers_1.METADATA_FACTORY_NAME]?.()[propertyKey]?.type ??
                Reflect.getMetadata("design:type", target, propertyKey);
            Reflect.defineMetadata(metakey, {
                type,
                required: false, // Default to optional unless @required() is used
                ...(0, lodash_1.pickBy)(metadata, (0, lodash_1.negate)(exports.isUndefined)),
            }, target, propertyKey);
        }
    });
}
const isEnumArray = (opts) => (opts.isArray && "enum" in opts && opts.enum !== undefined);
/**
 * @publicApi
 */
function ApiProperty(options = {}) {
    return createApiPropertyDecorator(options);
}
function createApiPropertyDecorator(options = {}, overrideExisting = true) {
    const [type, isArray] = (0, helpers_1.getTypeIsArrayTuple)(options.type, options.isArray);
    options = {
        ...options,
        type,
        isArray,
    };
    if (isEnumArray(options)) {
        options.type = "array";
        const enumValues = getEnumValues(options.enum);
        options.items = {
            type: getEnumType(enumValues),
            enum: enumValues,
        };
        // @ts-expect-error nest js code
        delete options.enum;
    }
    else if ("enum" in options && options.enum !== undefined) {
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
    return createPropertyDecorator(constants_1.DECORATORS.API_MODEL_PROPERTIES, options, overrideExisting);
}
