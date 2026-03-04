"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.METHOD_METADATA = exports.METADATA_FACTORY_NAME = exports.isConstructor = void 0;
exports.createMethodDecorator = createMethodDecorator;
exports.createClassDecorator = createClassDecorator;
exports.createPropertyDecorator = createPropertyDecorator;
exports.createMixedDecorator = createMixedDecorator;
exports.createParamDecorator = createParamDecorator;
exports.getTypeIsArrayTuple = getTypeIsArrayTuple;
const lodash_1 = require("lodash");
const constants_1 = require("./constants");
const isConstructor = (val) => val === "constructor";
exports.isConstructor = isConstructor;
exports.METADATA_FACTORY_NAME = "_OPENAPI_METADATA_FACTORY";
exports.METHOD_METADATA = "method";
function createMethodDecorator(metakey, metadata, { overrideExisting } = { overrideExisting: true }) {
    return (target, key, descriptor) => {
        if (typeof metadata === "object") {
            const prevValue = Reflect.getMetadata(metakey, descriptor.value);
            if (prevValue && !overrideExisting) {
                return descriptor;
            }
            Reflect.defineMetadata(metakey, { ...prevValue, ...metadata }, descriptor.value);
            return descriptor;
        }
        Reflect.defineMetadata(metakey, metadata, descriptor.value);
        return descriptor;
    };
}
function createClassDecorator(metakey, metadata = []) {
    return (target) => {
        const prevValue = Reflect.getMetadata(metakey, target) || [];
        Reflect.defineMetadata(metakey, [...prevValue, ...metadata], target);
        return target;
    };
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
            const newMetadata = (0, lodash_1.pickBy)(metadata, (0, lodash_1.negate)(lodash_1.isUndefined));
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
            const type = target?.constructor?.[exports.METADATA_FACTORY_NAME]?.()[propertyKey]?.type ?? Reflect.getMetadata("design:type", target, propertyKey);
            Reflect.defineMetadata(metakey, {
                type,
                ...(0, lodash_1.pickBy)(metadata, (0, lodash_1.negate)(lodash_1.isUndefined)),
            }, target, propertyKey);
        }
    });
}
function createMixedDecorator(metakey, metadata) {
    return (target, key, descriptor) => {
        if (descriptor) {
            let metadatas;
            if (Array.isArray(metadata)) {
                const previousMetadata = Reflect.getMetadata(metakey, descriptor.value) || [];
                metadatas = [...previousMetadata, ...metadata];
            }
            else {
                const previousMetadata = Reflect.getMetadata(metakey, descriptor.value) || {};
                metadatas = { ...previousMetadata, ...metadata };
            }
            Reflect.defineMetadata(metakey, metadatas, descriptor.value);
            return descriptor;
        }
        let metadatas;
        if (Array.isArray(metadata)) {
            const previousMetadata = Reflect.getMetadata(metakey, target) || [];
            metadatas = [...previousMetadata, ...metadata];
        }
        else {
            const previousMetadata = Reflect.getMetadata(metakey, target) || {};
            metadatas = Object.assign(Object.assign({}, previousMetadata), metadata);
        }
        Reflect.defineMetadata(metakey, metadatas, target);
        return target;
    };
}
function createParamDecorator(metadata, initial) {
    return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    target, key, descriptor) => {
        const paramOptions = {
            ...initial,
            ...(0, lodash_1.pickBy)(metadata, (0, lodash_1.negate)(lodash_1.isUndefined)),
        };
        if (descriptor) {
            const parameters = Reflect.getMetadata(constants_1.DECORATORS.API_PARAMETERS, descriptor.value) || [];
            Reflect.defineMetadata(constants_1.DECORATORS.API_PARAMETERS, [...parameters, paramOptions], descriptor.value);
            return descriptor;
        }
        if (typeof target === "object") {
            return target;
        }
        const propertyKeys = Object.getOwnPropertyNames(target.prototype);
        for (const propertyKey of propertyKeys) {
            if ((0, exports.isConstructor)(propertyKey)) {
                continue;
            }
            const methodDescriptor = Object.getOwnPropertyDescriptor(target.prototype, propertyKey);
            if (!methodDescriptor) {
                continue;
            }
            const isApiMethod = Reflect.hasMetadata(exports.METHOD_METADATA, methodDescriptor.value);
            if (!isApiMethod) {
                continue;
            }
            const parameters = Reflect.getMetadata(constants_1.DECORATORS.API_PARAMETERS, methodDescriptor.value) || [];
            Reflect.defineMetadata(constants_1.DECORATORS.API_PARAMETERS, [...parameters, paramOptions], methodDescriptor.value);
        }
    };
}
function getTypeIsArrayTuple(
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
input, isArrayFlag
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
) {
    if (!input) {
        return [input, isArrayFlag];
    }
    if (isArrayFlag) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
        return [input, isArrayFlag];
    }
    const isInputArray = (0, lodash_1.isArray)(input);
    const type = isInputArray ? input[0] : input;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    return [type, isInputArray];
}
