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
exports.MultiLevelGeneratedModel = exports.DeepOwnedModel = exports.DeepAuditRoot = void 0;
const decorator_validation_1 = require("@decaf-ts/decorator-validation");
const core_1 = require("@decaf-ts/core");
const db_decorators_1 = require("@decaf-ts/db-decorators");
let DeepAuditRoot = (() => {
    let _classDecorators = [(0, decorator_validation_1.model)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = decorator_validation_1.Model;
    let _version_decorators;
    let _version_initializers = [];
    let _version_extraInitializers = [];
    let _createdAt_decorators;
    let _createdAt_initializers = [];
    let _createdAt_extraInitializers = [];
    let _updatedAt_decorators;
    let _updatedAt_initializers = [];
    let _updatedAt_extraInitializers = [];
    var DeepAuditRoot = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _version_decorators = [(0, core_1.column)(), (0, db_decorators_1.version)()];
            _createdAt_decorators = [(0, core_1.column)(), (0, core_1.createdAt)()];
            _updatedAt_decorators = [(0, core_1.column)(), (0, core_1.updatedAt)()];
            __esDecorate(null, null, _version_decorators, { kind: "field", name: "version", static: false, private: false, access: { has: obj => "version" in obj, get: obj => obj.version, set: (obj, value) => { obj.version = value; } }, metadata: _metadata }, _version_initializers, _version_extraInitializers);
            __esDecorate(null, null, _createdAt_decorators, { kind: "field", name: "createdAt", static: false, private: false, access: { has: obj => "createdAt" in obj, get: obj => obj.createdAt, set: (obj, value) => { obj.createdAt = value; } }, metadata: _metadata }, _createdAt_initializers, _createdAt_extraInitializers);
            __esDecorate(null, null, _updatedAt_decorators, { kind: "field", name: "updatedAt", static: false, private: false, access: { has: obj => "updatedAt" in obj, get: obj => obj.updatedAt, set: (obj, value) => { obj.updatedAt = value; } }, metadata: _metadata }, _updatedAt_initializers, _updatedAt_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DeepAuditRoot = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        version = __runInitializers(this, _version_initializers, void 0);
        createdAt = (__runInitializers(this, _version_extraInitializers), __runInitializers(this, _createdAt_initializers, void 0));
        updatedAt = (__runInitializers(this, _createdAt_extraInitializers), __runInitializers(this, _updatedAt_initializers, void 0));
        constructor() {
            super(...arguments);
            __runInitializers(this, _updatedAt_extraInitializers);
        }
    };
    return DeepAuditRoot = _classThis;
})();
exports.DeepAuditRoot = DeepAuditRoot;
let DeepOwnedModel = (() => {
    let _classDecorators = [(0, decorator_validation_1.model)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = DeepAuditRoot;
    let _createdBy_decorators;
    let _createdBy_initializers = [];
    let _createdBy_extraInitializers = [];
    let _updatedBy_decorators;
    let _updatedBy_initializers = [];
    let _updatedBy_extraInitializers = [];
    var DeepOwnedModel = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _createdBy_decorators = [(0, core_1.column)(), (0, core_1.createdBy)()];
            _updatedBy_decorators = [(0, core_1.column)(), (0, core_1.updatedBy)()];
            __esDecorate(null, null, _createdBy_decorators, { kind: "field", name: "createdBy", static: false, private: false, access: { has: obj => "createdBy" in obj, get: obj => obj.createdBy, set: (obj, value) => { obj.createdBy = value; } }, metadata: _metadata }, _createdBy_initializers, _createdBy_extraInitializers);
            __esDecorate(null, null, _updatedBy_decorators, { kind: "field", name: "updatedBy", static: false, private: false, access: { has: obj => "updatedBy" in obj, get: obj => obj.updatedBy, set: (obj, value) => { obj.updatedBy = value; } }, metadata: _metadata }, _updatedBy_initializers, _updatedBy_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DeepOwnedModel = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        createdBy = __runInitializers(this, _createdBy_initializers, void 0);
        updatedBy = (__runInitializers(this, _createdBy_extraInitializers), __runInitializers(this, _updatedBy_initializers, void 0));
        constructor() {
            super(...arguments);
            __runInitializers(this, _updatedBy_extraInitializers);
        }
    };
    return DeepOwnedModel = _classThis;
})();
exports.DeepOwnedModel = DeepOwnedModel;
let MultiLevelGeneratedModel = (() => {
    let _classDecorators = [(0, decorator_validation_1.model)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = DeepOwnedModel;
    let _multiId_decorators;
    let _multiId_initializers = [];
    let _multiId_extraInitializers = [];
    let _multiName_decorators;
    let _multiName_initializers = [];
    let _multiName_extraInitializers = [];
    let _multiFlag_decorators;
    let _multiFlag_initializers = [];
    let _multiFlag_extraInitializers = [];
    var MultiLevelGeneratedModel = class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _multiId_decorators = [(0, core_1.pk)(), (0, core_1.column)()];
            _multiName_decorators = [(0, core_1.column)()];
            _multiFlag_decorators = [(0, core_1.column)()];
            __esDecorate(null, null, _multiId_decorators, { kind: "field", name: "multiId", static: false, private: false, access: { has: obj => "multiId" in obj, get: obj => obj.multiId, set: (obj, value) => { obj.multiId = value; } }, metadata: _metadata }, _multiId_initializers, _multiId_extraInitializers);
            __esDecorate(null, null, _multiName_decorators, { kind: "field", name: "multiName", static: false, private: false, access: { has: obj => "multiName" in obj, get: obj => obj.multiName, set: (obj, value) => { obj.multiName = value; } }, metadata: _metadata }, _multiName_initializers, _multiName_extraInitializers);
            __esDecorate(null, null, _multiFlag_decorators, { kind: "field", name: "multiFlag", static: false, private: false, access: { has: obj => "multiFlag" in obj, get: obj => obj.multiFlag, set: (obj, value) => { obj.multiFlag = value; } }, metadata: _metadata }, _multiFlag_initializers, _multiFlag_extraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MultiLevelGeneratedModel = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        multiId = __runInitializers(this, _multiId_initializers, void 0);
        multiName = (__runInitializers(this, _multiId_extraInitializers), __runInitializers(this, _multiName_initializers, void 0));
        multiFlag = (__runInitializers(this, _multiName_extraInitializers), __runInitializers(this, _multiFlag_initializers, void 0));
        constructor() {
            super(...arguments);
            __runInitializers(this, _multiFlag_extraInitializers);
        }
    };
    return MultiLevelGeneratedModel = _classThis;
})();
exports.MultiLevelGeneratedModel = MultiLevelGeneratedModel;
