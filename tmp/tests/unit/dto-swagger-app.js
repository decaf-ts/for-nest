"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DtoSwaggerModule = exports.MultiLevelUpdateDTO = exports.MultiLevelCreateDTO = exports.UpdateDTO = exports.CreateDTO = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const db_decorators_1 = require("@decaf-ts/db-decorators");
const core_1 = require("@decaf-ts/core");
const ram_1 = require("@decaf-ts/core/ram");
const DtoBuilder_1 = require("../../src/factory/openapi/DtoBuilder");
const Product_1 = require("./Product");
const MultiLevelGeneratedModel_1 = require("./MultiLevelGeneratedModel");
ram_1.RamAdapter.decoration();
core_1.Adapter.setCurrent(ram_1.RamFlavour);
exports.CreateDTO = (0, DtoBuilder_1.DtoFor)(db_decorators_1.OperationKeys.CREATE, Product_1.Product);
exports.UpdateDTO = (0, DtoBuilder_1.DtoFor)(db_decorators_1.OperationKeys.UPDATE, Product_1.Product);
exports.MultiLevelCreateDTO = (0, DtoBuilder_1.DtoFor)(db_decorators_1.OperationKeys.CREATE, MultiLevelGeneratedModel_1.MultiLevelGeneratedModel);
exports.MultiLevelUpdateDTO = (0, DtoBuilder_1.DtoFor)(db_decorators_1.OperationKeys.UPDATE, MultiLevelGeneratedModel_1.MultiLevelGeneratedModel);
let TestDtoController = (() => {
    let _classDecorators = [(0, common_1.Controller)("dto-for-test")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _update_decorators;
    var TestDtoController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)("create"), (0, swagger_1.ApiBody)({ type: exports.CreateDTO })];
            _update_decorators = [(0, common_1.Put)("update"), (0, swagger_1.ApiBody)({ type: exports.UpdateDTO })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TestDtoController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        create(body) {
            return body;
        }
        update(body) {
            return body;
        }
        constructor() {
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
    return TestDtoController = _classThis;
})();
let MultiLevelDtoController = (() => {
    let _classDecorators = [(0, common_1.Controller)("multi-level-dto")];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _create_decorators;
    let _update_decorators;
    var MultiLevelDtoController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _create_decorators = [(0, common_1.Post)("create"), (0, swagger_1.ApiBody)({ type: exports.MultiLevelCreateDTO })];
            _update_decorators = [(0, common_1.Put)("update/:id"), (0, swagger_1.ApiBody)({ type: exports.MultiLevelUpdateDTO })];
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MultiLevelDtoController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        create(body) {
            return body;
        }
        update(id, body) {
            return body;
        }
        constructor() {
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
    return MultiLevelDtoController = _classThis;
})();
let DtoSwaggerModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            controllers: [TestDtoController, MultiLevelDtoController],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DtoSwaggerModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DtoSwaggerModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return DtoSwaggerModule = _classThis;
})();
exports.DtoSwaggerModule = DtoSwaggerModule;
