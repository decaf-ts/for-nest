"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductStrength = void 0;
const decorator_validation_1 = require("@decaf-ts/decorator-validation");
const core_1 = require("@decaf-ts/core");
const decoration_1 = require("@decaf-ts/decoration");
const HLFIdentifiedModel_1 = require("./HLFIdentifiedModel");
let ProductStrength = (() => {
    let _classDecorators = [(0, decoration_1.uses)("ram"), (0, core_1.table)(), (0, decorator_validation_1.model)(), (0, decoration_1.description)("Represents the product’s strength and composition details.")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = HLFIdentifiedModel_1.HLFIdentifiedModel;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _productCode_decorators;
    let _productCode_initializers = [];
    let _productCode_extraInitializers = [];
    let _strength_decorators;
    let _strength_initializers = [];
    let _strength_extraInitializers = [];
    let _substance_decorators;
    let _substance_initializers = [];
    let _substance_extraInitializers = [];
    let _legalEntityName_decorators;
    let _legalEntityName_initializers = [];
    let _legalEntityName_extraInitializers = [];
    var ProductStrength = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _id_decorators = [(0, core_1.pk)(), (0, decoration_1.description)("Represents the product’s strength and composition details.")];
            _productCode_decorators = [(0, core_1.index)([core_1.OrderDirection.ASC, core_1.OrderDirection.DSC]), (0, decoration_1.description)("Product code associated with this strength entry.")];
            _strength_decorators = [(0, core_1.column)(), (0, decorator_validation_1.required)(), (0, core_1.index)([core_1.OrderDirection.ASC, core_1.OrderDirection.DSC]), (0, decoration_1.description)("Product concentration or dosage (e.g., 500mg, 10%).")];
            _substance_decorators = [(0, core_1.column)(), (0, core_1.index)([core_1.OrderDirection.ASC, core_1.OrderDirection.DSC]), (0, decoration_1.description)("Active substance related to this product strength.")];
            _legalEntityName_decorators = [(0, core_1.column)(), (0, decoration_1.description)("Legal entity name responsible for the product.")];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _productCode_decorators, { kind: "field", name: "productCode", static: false, private: false, access: { has: obj => "productCode" in obj, get: obj => obj.productCode, set: (obj, value) => { obj.productCode = value; } }, metadata: _metadata }, _productCode_initializers, _productCode_extraInitializers);
            __esDecorate(null, null, _strength_decorators, { kind: "field", name: "strength", static: false, private: false, access: { has: obj => "strength" in obj, get: obj => obj.strength, set: (obj, value) => { obj.strength = value; } }, metadata: _metadata }, _strength_initializers, _strength_extraInitializers);
            __esDecorate(null, null, _substance_decorators, { kind: "field", name: "substance", static: false, private: false, access: { has: obj => "substance" in obj, get: obj => obj.substance, set: (obj, value) => { obj.substance = value; } }, metadata: _metadata }, _substance_initializers, _substance_extraInitializers);
            __esDecorate(null, null, _legalEntityName_decorators, { kind: "field", name: "legalEntityName", static: false, private: false, access: { has: obj => "legalEntityName" in obj, get: obj => obj.legalEntityName, set: (obj, value) => { obj.legalEntityName = value; } }, metadata: _metadata }, _legalEntityName_initializers, _legalEntityName_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProductStrength = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        id = __runInitializers(this, _id_initializers, void 0);
        productCode = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _productCode_initializers, void 0));
        strength = (__runInitializers(this, _productCode_extraInitializers), __runInitializers(this, _strength_initializers, void 0));
        substance = (__runInitializers(this, _strength_extraInitializers), __runInitializers(this, _substance_initializers, void 0));
        legalEntityName = (__runInitializers(this, _substance_extraInitializers), __runInitializers(this, _legalEntityName_initializers, void 0));
        constructor(model) {
            super(model);
            __runInitializers(this, _legalEntityName_extraInitializers);
        }
    };
    return ProductStrength = _classThis;
})();
exports.ProductStrength = ProductStrength;
