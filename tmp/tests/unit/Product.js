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
exports.Product = void 0;
const decorator_validation_1 = require("@decaf-ts/decorator-validation");
const core_1 = require("@decaf-ts/core");
const decoration_1 = require("@decaf-ts/decoration");
const ProductStrength_1 = require("./ProductStrength");
const ProductMarket_1 = require("./ProductMarket");
const ProductImage_1 = require("./ProductImage");
const HLFIdentifiedModel_1 = require("./HLFIdentifiedModel");
// @BlockOperations([OperationKeys.DELETE])
let Product = (() => {
    let _classDecorators = [(0, decoration_1.uses)("ram"), (0, core_1.table)("product"), (0, decorator_validation_1.model)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = HLFIdentifiedModel_1.HLFIdentifiedModel;
    let _productCode_decorators;
    let _productCode_initializers = [];
    let _productCode_extraInitializers = [];
    let _inventedName_decorators;
    let _inventedName_initializers = [];
    let _inventedName_extraInitializers = [];
    let _nameMedicinalProduct_decorators;
    let _nameMedicinalProduct_initializers = [];
    let _nameMedicinalProduct_extraInitializers = [];
    let _internalMaterialCode_decorators;
    let _internalMaterialCode_initializers = [];
    let _internalMaterialCode_extraInitializers = [];
    let _productRecall_decorators;
    let _productRecall_initializers = [];
    let _productRecall_extraInitializers = [];
    let _imageData_decorators;
    let _imageData_initializers = [];
    let _imageData_extraInitializers = [];
    let _strengths_decorators;
    let _strengths_initializers = [];
    let _strengths_extraInitializers = [];
    let _markets_decorators;
    let _markets_initializers = [];
    let _markets_extraInitializers = [];
    let _owner_decorators;
    let _owner_initializers = [];
    let _owner_extraInitializers = [];
    var Product = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _productCode_decorators = [(0, core_1.pk)(), (0, decoration_1.description)("the product code")];
            _inventedName_decorators = [(0, core_1.column)(), (0, decorator_validation_1.required)(), (0, core_1.index)([core_1.OrderDirection.ASC, core_1.OrderDirection.DSC]), (0, decoration_1.description)("the product code")];
            _nameMedicinalProduct_decorators = [(0, core_1.column)(), (0, decorator_validation_1.required)(), (0, core_1.index)([core_1.OrderDirection.ASC, core_1.OrderDirection.DSC]), (0, decoration_1.description)("the product code")];
            _internalMaterialCode_decorators = [(0, core_1.column)(), (0, decoration_1.prop)()];
            _productRecall_decorators = [(0, core_1.column)(), (0, core_1.index)([core_1.OrderDirection.ASC, core_1.OrderDirection.DSC]), (0, decoration_1.description)("the product code")];
            _imageData_decorators = [(0, core_1.oneToOne)(() => ProductImage_1.ProductImage, {
                    update: core_1.Cascade.CASCADE,
                    delete: core_1.Cascade.CASCADE,
                }, false), (0, decoration_1.description)("the product image")];
            _strengths_decorators = [(0, core_1.oneToMany)(() => ProductStrength_1.ProductStrength, { update: core_1.Cascade.CASCADE, delete: core_1.Cascade.CASCADE }, true), (0, decoration_1.description)("the products strengths")];
            _markets_decorators = [(0, core_1.oneToMany)(() => ProductMarket_1.ProductMarket, { update: core_1.Cascade.CASCADE, delete: core_1.Cascade.CASCADE }, true), (0, decoration_1.description)("list of markets for the product")];
            _owner_decorators = [(0, decoration_1.description)("the owner (msp) of the product")];
            __esDecorate(null, null, _productCode_decorators, { kind: "field", name: "productCode", static: false, private: false, access: { has: obj => "productCode" in obj, get: obj => obj.productCode, set: (obj, value) => { obj.productCode = value; } }, metadata: _metadata }, _productCode_initializers, _productCode_extraInitializers);
            __esDecorate(null, null, _inventedName_decorators, { kind: "field", name: "inventedName", static: false, private: false, access: { has: obj => "inventedName" in obj, get: obj => obj.inventedName, set: (obj, value) => { obj.inventedName = value; } }, metadata: _metadata }, _inventedName_initializers, _inventedName_extraInitializers);
            __esDecorate(null, null, _nameMedicinalProduct_decorators, { kind: "field", name: "nameMedicinalProduct", static: false, private: false, access: { has: obj => "nameMedicinalProduct" in obj, get: obj => obj.nameMedicinalProduct, set: (obj, value) => { obj.nameMedicinalProduct = value; } }, metadata: _metadata }, _nameMedicinalProduct_initializers, _nameMedicinalProduct_extraInitializers);
            __esDecorate(null, null, _internalMaterialCode_decorators, { kind: "field", name: "internalMaterialCode", static: false, private: false, access: { has: obj => "internalMaterialCode" in obj, get: obj => obj.internalMaterialCode, set: (obj, value) => { obj.internalMaterialCode = value; } }, metadata: _metadata }, _internalMaterialCode_initializers, _internalMaterialCode_extraInitializers);
            __esDecorate(null, null, _productRecall_decorators, { kind: "field", name: "productRecall", static: false, private: false, access: { has: obj => "productRecall" in obj, get: obj => obj.productRecall, set: (obj, value) => { obj.productRecall = value; } }, metadata: _metadata }, _productRecall_initializers, _productRecall_extraInitializers);
            __esDecorate(null, null, _imageData_decorators, { kind: "field", name: "imageData", static: false, private: false, access: { has: obj => "imageData" in obj, get: obj => obj.imageData, set: (obj, value) => { obj.imageData = value; } }, metadata: _metadata }, _imageData_initializers, _imageData_extraInitializers);
            __esDecorate(null, null, _strengths_decorators, { kind: "field", name: "strengths", static: false, private: false, access: { has: obj => "strengths" in obj, get: obj => obj.strengths, set: (obj, value) => { obj.strengths = value; } }, metadata: _metadata }, _strengths_initializers, _strengths_extraInitializers);
            __esDecorate(null, null, _markets_decorators, { kind: "field", name: "markets", static: false, private: false, access: { has: obj => "markets" in obj, get: obj => obj.markets, set: (obj, value) => { obj.markets = value; } }, metadata: _metadata }, _markets_initializers, _markets_extraInitializers);
            __esDecorate(null, null, _owner_decorators, { kind: "field", name: "owner", static: false, private: false, access: { has: obj => "owner" in obj, get: obj => obj.owner, set: (obj, value) => { obj.owner = value; } }, metadata: _metadata }, _owner_initializers, _owner_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            Product = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        productCode = __runInitializers(this, _productCode_initializers, void 0);
        inventedName = (__runInitializers(this, _productCode_extraInitializers), __runInitializers(this, _inventedName_initializers, void 0));
        nameMedicinalProduct = (__runInitializers(this, _inventedName_extraInitializers), __runInitializers(this, _nameMedicinalProduct_initializers, void 0));
        internalMaterialCode = (__runInitializers(this, _nameMedicinalProduct_extraInitializers), __runInitializers(this, _internalMaterialCode_initializers, void 0));
        productRecall = (__runInitializers(this, _internalMaterialCode_extraInitializers), __runInitializers(this, _productRecall_initializers, false));
        imageData = (__runInitializers(this, _productRecall_extraInitializers), __runInitializers(this, _imageData_initializers, void 0));
        //
        // @column()
        // flagEnableAdverseEventReporting?: boolean;
        //
        // @column()
        // adverseEventReportingURL?: string;
        //
        // @column()
        // flagEnableACFProductCheck?: boolean;
        //
        // @column()
        // @url()
        // acfProductCheckURL?: string;
        //
        // @column()
        // patientSpecificLeaflet?: string;
        //
        // @column()
        // healthcarePractitionerInfo?: string;
        //
        // @column()
        // counter?: number;
        strengths = (__runInitializers(this, _imageData_extraInitializers), __runInitializers(this, _strengths_initializers, void 0));
        markets = (__runInitializers(this, _strengths_extraInitializers), __runInitializers(this, _markets_initializers, void 0));
        owner = (__runInitializers(this, _markets_extraInitializers), __runInitializers(this, _owner_initializers, void 0));
        constructor(args) {
            super(args);
            __runInitializers(this, _owner_extraInitializers);
        }
    };
    return Product = _classThis;
})();
exports.Product = Product;
