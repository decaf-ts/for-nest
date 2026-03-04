"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtoFor = DtoFor;
const db_decorators_1 = require("@decaf-ts/db-decorators");
const decoration_1 = require("@decaf-ts/decoration");
const decoration_2 = require("../../overrides/decoration");
const decorator_validation_1 = require("@decaf-ts/decorator-validation");
const core_1 = require("@decaf-ts/core");
const logging_1 = require("@decaf-ts/logging");
const constants_1 = require("../../overrides/constants");
const dtoCache = new Map();
/**
 * Builds a Nest/Swagger DTO class for the given model and CRUD operation.
 *
 * Rules:
 *  - Only CREATE and UPDATE (and their bulk variants) produce a DTO;
 *    all other operations return the original model class unchanged.
 *  - @generated() properties (createdAt, updatedAt, createdBy, updatedBy,
 *    uuid, version, @composed pks, …) are **never** exposed in any DTO.
 *  - The @pk() property:
 *      • UPDATE – always included.
 *      • CREATE  – included only when the pk is NOT auto-generated
 *                  (checked via Model.pkProps().generated AND Model.generated()).
 *  - Relation properties (@oneToOne, @oneToMany, …):
 *      • CREATE  – nested as DtoFor(CREATE, RelatedModel).
 *      • UPDATE  – union of DtoFor(UPDATE, RelatedModel) **or** the
 *                  related model's primary-key type (string / integer),
 *                  expressed as a Swagger oneOf.
 *
 * Metadata.properties() now returns ALL properties across the prototype chain,
 * so DTO inheritance is no longer needed; every DTO is a flat class.
 */
function DtoFor(op, model) {
    if (!core_1.TransactionOperationKeys.includes(op)) {
        return model;
    }
    const cache = getDtoCache(op);
    const cached = cache.get(model);
    if (cached)
        return cached;
    const isUpdateOp = [
        db_decorators_1.OperationKeys.UPDATE,
        db_decorators_1.BulkCrudOperationKeys.UPDATE_ALL,
    ].includes(op);
    class DynamicDTO {
    }
    cache.set(model, DynamicDTO);
    Object.defineProperty(DynamicDTO, "name", {
        value: `${(0, logging_1.toPascalCase)(model.name)}${(0, logging_1.toPascalCase)(op)}DTO`,
    });
    const pkProp = (() => {
        try {
            return decorator_validation_1.Model.pk(model);
        }
        catch {
            return undefined;
        }
    })();
    const pkPropsMetadata = pkProp ? decorator_validation_1.Model.pkProps(model) : undefined;
    const pkIsGenerated = !!pkPropsMetadata?.generated ||
        (pkProp
            ? isPropertyGeneratedAcrossInheritance(model, pkProp)
            : false);
    const allProps = Array.from(new Set(decoration_1.Metadata.properties(model) || []));
    const relations = new Set(decorator_validation_1.Model.relations(model) || []);
    for (const prop of allProps) {
        if (relations.has(prop))
            continue;
        if (prop === pkProp && !isUpdateOp && pkIsGenerated)
            continue;
        if (prop !== pkProp && isPropertyGeneratedAcrossInheritance(model, prop))
            continue;
        const validation = getValidationAcrossInheritance(model, prop);
        const isRequired = !!validation?.[decorator_validation_1.ValidationKeys.REQUIRED];
        const typeHint = getTypeAcrossInheritance(model, prop) ??
            Reflect.getMetadata("design:type", model.prototype, prop);
        const apiOptions = {
            required: isRequired,
        };
        if (typeHint)
            apiOptions.type = typeHint;
        (0, decoration_2.ApiProperty)(apiOptions)(DynamicDTO.prototype, prop);
        const designType = Reflect.getMetadata("design:type", model.prototype, prop) ?? typeHint;
        if (typeof designType !== "undefined") {
            Reflect.defineMetadata("design:type", designType, DynamicDTO.prototype, prop);
        }
        Object.defineProperty(DynamicDTO.prototype, prop, {
            value: undefined,
            writable: true,
            enumerable: true,
            configurable: true,
        });
    }
    for (const relation of relations) {
        const relationMeta = decoration_1.Metadata.relations(model, relation);
        if (!relationMeta) {
            throw new db_decorators_1.InternalError(`Metadata for relation ${relation} not found`);
        }
        let relationType = relationMeta.class;
        if (typeof relationType === "function" && !relationType.name) {
            relationType = relationType();
        }
        if (!relationType || typeof relationType !== "function") {
            throw new db_decorators_1.InternalError(`Type for relation ${relation} not found`);
        }
        if (!decorator_validation_1.Model.get(relationType.name)) {
            continue;
        }
        const meta = decoration_1.Metadata.validationFor(model, relation);
        const isArray = !!meta?.[decorator_validation_1.ValidationKeys.LIST];
        const isRequired = !!meta?.[decorator_validation_1.ValidationKeys.REQUIRED];
        const relationDto = DtoFor(op, relationType);
        if (isUpdateOp) {
            addRelationUpdate(DynamicDTO, relation, relationType, relationDto, isArray, isRequired);
        }
        else {
            addRelation(DynamicDTO, relation, relationDto, isArray, isRequired);
        }
    }
    return DynamicDTO;
}
function addRelation(DtoClass, relation, relationDto, isArray, isRequired) {
    const apiOptions = {
        type: relationDto,
        required: isRequired,
        isArray,
    };
    (0, decoration_2.ApiProperty)(apiOptions)(DtoClass.prototype, relation);
    Reflect.defineMetadata("design:type", isArray ? Array : relationDto, DtoClass.prototype, relation);
    Object.defineProperty(DtoClass.prototype, relation, {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}
function addRelationUpdate(DtoClass, relation, relationType, relationDto, isArray, isRequired) {
    const extraModels = Reflect.getMetadata(constants_1.DECORATORS.API_EXTRA_MODELS, DtoClass) || [];
    if (!extraModels.includes(relationDto)) {
        Reflect.defineMetadata(constants_1.DECORATORS.API_EXTRA_MODELS, [...extraModels, relationDto], DtoClass);
    }
    const dtoRef = `#/components/schemas/${relationDto.name}`;
    const pkTypeName = getPkOpenApiType(relationType);
    const oneOfItems = [{ $ref: dtoRef }, { type: pkTypeName }];
    const apiOptions = isArray
        ? { type: "array", required: isRequired, oneOf: oneOfItems }
        : { type: Object, required: isRequired, oneOf: oneOfItems };
    (0, decoration_2.ApiProperty)(apiOptions)(DtoClass.prototype, relation);
    Reflect.defineMetadata("design:type", isArray ? Array : Object, DtoClass.prototype, relation);
    Object.defineProperty(DtoClass.prototype, relation, {
        value: undefined,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}
function getPkOpenApiType(relationType) {
    try {
        const pkPropsMetadata = decorator_validation_1.Model.pkProps(relationType);
        const pkType = pkPropsMetadata?.type;
        if (pkType === Number || pkType === BigInt)
            return "integer";
        return "string";
    }
    catch {
        return "string";
    }
}
function isPropertyGeneratedAcrossInheritance(model, prop) {
    let current = model;
    while (current && current !== Object && current !== Function) {
        if (decorator_validation_1.Model.generated(current, prop))
            return true;
        current = Object.getPrototypeOf(current);
    }
    return false;
}
function getValidationAcrossInheritance(model, prop) {
    let current = model;
    while (current && current !== Object && current !== Function) {
        const validation = decoration_1.Metadata.validationFor(current, prop);
        if (validation)
            return validation;
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}
function getTypeAcrossInheritance(model, prop) {
    let current = model;
    while (current && current !== Object && current !== Function) {
        const type = decoration_1.Metadata.type(current, prop);
        if (type)
            return type;
        current = Object.getPrototypeOf(current);
    }
    return undefined;
}
function getDtoCache(op) {
    if (!dtoCache.has(op)) {
        dtoCache.set(op, new WeakMap());
    }
    return dtoCache.get(op);
}
