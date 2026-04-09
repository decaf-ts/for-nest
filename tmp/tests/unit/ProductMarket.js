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
exports.ProductMarket = void 0;
const decorator_validation_1 = require("@decaf-ts/decorator-validation");
const decorator_validation_2 = require("@decaf-ts/decorator-validation");
const core_1 = require("@decaf-ts/core");
const decoration_1 = require("@decaf-ts/decoration");
const db_decorators_1 = require("@decaf-ts/db-decorators");
const HLFIdentifiedModel_1 = require("./HLFIdentifiedModel");
let ProductMarket = (() => {
    let _classDecorators = [(0, decoration_1.description)("Links a product to a specific market."), (0, decoration_1.uses)("ram"), (0, core_1.table)(), (0, decorator_validation_2.model)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = HLFIdentifiedModel_1.HLFIdentifiedModel;
    let _id_decorators;
    let _id_initializers = [];
    let _id_extraInitializers = [];
    let _marketId_decorators;
    let _marketId_initializers = [];
    let _marketId_extraInitializers = [];
    let _productCode_decorators;
    let _productCode_initializers = [];
    let _productCode_extraInitializers = [];
    let _nationalCode_decorators;
    let _nationalCode_initializers = [];
    let _nationalCode_extraInitializers = [];
    let _mahName_decorators;
    let _mahName_initializers = [];
    let _mahName_extraInitializers = [];
    let _legalEntityName_decorators;
    let _legalEntityName_initializers = [];
    let _legalEntityName_extraInitializers = [];
    let _mahAddress_decorators;
    let _mahAddress_initializers = [];
    let _mahAddress_extraInitializers = [];
    var ProductMarket = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _id_decorators = [(0, core_1.pk)(), (0, db_decorators_1.composed)(["productCode", "marketId"], ":", true), (0, decoration_1.description)("Unique identifier composed of product code and market ID.")];
            _marketId_decorators = [(0, core_1.column)(), (0, decorator_validation_1.required)(), (0, core_1.index)([core_1.OrderDirection.ASC, core_1.OrderDirection.DSC]), (0, decoration_1.description)("Identifier of the market where the product is registered or sold.")];
            _productCode_decorators = [(0, core_1.column)(), (0, decorator_validation_1.required)()];
            _nationalCode_decorators = [(0, core_1.column)(), (0, decorator_validation_2.minlength)(2), (0, decorator_validation_2.maxlength)(2), (0, decoration_1.description)("Two-letter national code (ISO format) representing the market's country.")];
            _mahName_decorators = [(0, core_1.column)(), (0, decoration_1.description)("Name of the Marketing Authorization Holder (MAH).")];
            _legalEntityName_decorators = [(0, core_1.column)(), (0, decoration_1.description)("Name of the legal entity responsible for the product in this market.")];
            _mahAddress_decorators = [(0, core_1.column)(), (0, decoration_1.description)("Address of the Marketing Authorization Holder or responsible legal entity.")];
            __esDecorate(null, null, _id_decorators, { kind: "field", name: "id", static: false, private: false, access: { has: obj => "id" in obj, get: obj => obj.id, set: (obj, value) => { obj.id = value; } }, metadata: _metadata }, _id_initializers, _id_extraInitializers);
            __esDecorate(null, null, _marketId_decorators, { kind: "field", name: "marketId", static: false, private: false, access: { has: obj => "marketId" in obj, get: obj => obj.marketId, set: (obj, value) => { obj.marketId = value; } }, metadata: _metadata }, _marketId_initializers, _marketId_extraInitializers);
            __esDecorate(null, null, _productCode_decorators, { kind: "field", name: "productCode", static: false, private: false, access: { has: obj => "productCode" in obj, get: obj => obj.productCode, set: (obj, value) => { obj.productCode = value; } }, metadata: _metadata }, _productCode_initializers, _productCode_extraInitializers);
            __esDecorate(null, null, _nationalCode_decorators, { kind: "field", name: "nationalCode", static: false, private: false, access: { has: obj => "nationalCode" in obj, get: obj => obj.nationalCode, set: (obj, value) => { obj.nationalCode = value; } }, metadata: _metadata }, _nationalCode_initializers, _nationalCode_extraInitializers);
            __esDecorate(null, null, _mahName_decorators, { kind: "field", name: "mahName", static: false, private: false, access: { has: obj => "mahName" in obj, get: obj => obj.mahName, set: (obj, value) => { obj.mahName = value; } }, metadata: _metadata }, _mahName_initializers, _mahName_extraInitializers);
            __esDecorate(null, null, _legalEntityName_decorators, { kind: "field", name: "legalEntityName", static: false, private: false, access: { has: obj => "legalEntityName" in obj, get: obj => obj.legalEntityName, set: (obj, value) => { obj.legalEntityName = value; } }, metadata: _metadata }, _legalEntityName_initializers, _legalEntityName_extraInitializers);
            __esDecorate(null, null, _mahAddress_decorators, { kind: "field", name: "mahAddress", static: false, private: false, access: { has: obj => "mahAddress" in obj, get: obj => obj.mahAddress, set: (obj, value) => { obj.mahAddress = value; } }, metadata: _metadata }, _mahAddress_initializers, _mahAddress_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProductMarket = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        id = __runInitializers(this, _id_initializers, void 0);
        marketId = (__runInitializers(this, _id_extraInitializers), __runInitializers(this, _marketId_initializers, void 0));
        productCode = (__runInitializers(this, _marketId_extraInitializers), __runInitializers(this, _productCode_initializers, void 0));
        nationalCode = (__runInitializers(this, _productCode_extraInitializers), __runInitializers(this, _nationalCode_initializers, void 0));
        mahName = (__runInitializers(this, _nationalCode_extraInitializers), __runInitializers(this, _mahName_initializers, void 0));
        legalEntityName = (__runInitializers(this, _mahName_extraInitializers), __runInitializers(this, _legalEntityName_initializers, void 0));
        mahAddress = (__runInitializers(this, _legalEntityName_extraInitializers), __runInitializers(this, _mahAddress_initializers, void 0));
        constructor(model) {
            super(model);
            __runInitializers(this, _mahAddress_extraInitializers);
        }
    };
    return ProductMarket = _classThis;
})();
exports.ProductMarket = ProductMarket;
