import { Constructor, Metadata } from "@decaf-ts/decoration";
import { HookMetadataKeys } from "@decaf-ts/for-http/hooks";
import { Model } from "@decaf-ts/decorator-validation";
import { resolvePrincipal, assertOwnership } from "../webhooks/controllers";

function normalizeBulkIds(ids: string | string[] | undefined | null): string[] {
  if (Array.isArray(ids)) return ids;
  if (typeof ids === "string") return [ids];
  return [];
}

/**
 * @description Field names of a model that are marked write-only.
 * @summary A write-only field is settable on create but stripped from read/update
 * responses and excluded from the UPDATE OpenAPI DTO so it can never be read back
 * through the REST layer. Computed from the model's `@writeOnly()` metadata.
 * @param {Constructor<any>} ModelConstr - The model constructor
 * @returns {string[]} The write-only field names
 */
export function writeOnlyFieldsOf(ModelConstr: Constructor<any>): string[] {
  const props = Metadata.properties(ModelConstr) || [];
  return props.filter(
    (prop) =>
      Metadata.get(
        ModelConstr,
        Metadata.key(HookMetadataKeys.WRITE_ONLY, prop)
      ) === true
  );
}

type ScopingConfig = {
  ownerScopedField?: string;
};

const SINGLE_OPS = new Set([
  "create",
  "read",
  "update",
  "delete",
  "findOneBy",
]);

function stripWriteOnly(value: any, writeOnly: string[]): any {
  if (!value || typeof value !== "object") return value;
  for (const field of writeOnly) {
    try {
      Reflect.deleteProperty(value, field);
    } catch {
      // ignore - the field may not be deletable
    }
  }
  return value;
}

function isOwnedBy(principal: string, value: any, ownerField: string): boolean {
  const owner = value?.[ownerField];
  return !owner || owner === principal;
}

function outboundKind(ModelConstr: Constructor<any>): string {
  return ModelConstr.name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/**
 * @description Applies write-only stripping (+ ownership assert) to a single resource.
 */
function stripSingle(
  value: any,
  principal: string,
  ownerField: string | undefined,
  writeOnly: string[],
  ModelConstr: Constructor<any>
): any {
  if (!value || typeof value !== "object") return value;
  if (ownerField) {
    assertOwnership(principal, value, outboundKind(ModelConstr));
  }
  return stripWriteOnly(value, writeOnly);
}

/**
 * @description Applies write-only stripping + owner filtering to a list result.
 * @summary Handles both a bare array and a paginator shape (`{ data, ... }`).
 * Rows owned by another principal are dropped (never returned), legacy unowned
 * rows are kept, and write-only fields are stripped from every kept row.
 */
function stripList(
  value: any,
  principal: string,
  ownerField: string | undefined,
  writeOnly: string[]
): any {
  if (Array.isArray(value)) {
    return value
      .filter((item) => !ownerField || isOwnedBy(principal, item, ownerField))
      .map((item) => stripWriteOnly(item, writeOnly));
  }
  if (value && typeof value === "object" && Array.isArray(value.data)) {
    value.data = (value.data as any[])
      .filter((item) => !ownerField || isOwnedBy(principal, item, ownerField))
      .map((item) => stripWriteOnly(item, writeOnly));
    return value;
  }
  return value;
}

/**
 * @description Wraps a from-model CRUD handler with owner scoping + write-only
 * stripping.
 * @summary When `config.ownerField` is set the generated route is scoped to the
 * authenticated principal: `create`/`createAll` stamp the owner, single read /
 * update / delete assert ownership (IDOR throws {@link AuthorizationError}), and
 * list routes drop rows owned by a different principal. Legacy rows without an
 * owner remain viewable/operable by an authenticated caller. Write-only fields
 * are stripped from every returned resource. When neither scoping nor write-only
 * fields apply, the original handler is returned unchanged so non-scoped models
 * behave exactly as before.
 * @param {Function} handler - The original route implementation
 * @param {string} methodName - The registered method name (create/read/update/...)
 * @param {Constructor<any>} ModelConstr - The model constructor
 * @param {ScopingConfig} config - The merged controller factory config
 * @param {(routeParams: Array<string | number>) => string} [getPK] - Composes the
 * primary key from route params (single-id models default to the first param)
 * @returns {(...args: any[]) => Promise<any>} The scoped handler
 */
export function scopeHandler(
  handler: (...args: any[]) => any,
  methodName: string,
  ModelConstr: Constructor<any>,
  config: ScopingConfig,
  getPK?: (...p: Array<string | number>) => string
): (...args: any[]) => Promise<any> {
  const ownerField = config?.ownerField;
  const writeOnly = writeOnlyFieldsOf(ModelConstr);
  const needsScoping = Boolean(ownerField) || writeOnly.length > 0;

  if (!needsScoping) {
    return async function unscopedHandler(this: any, ...args: any[]) {
      return handler.apply(this, args);
    };
  }

  const isSingle = SINGLE_OPS.has(methodName);

  return async function scopedHandler(this: any, ...args: any[]): Promise<any> {
    const principal = ownerField ? resolvePrincipal(this.clientContext) : "";
    const persistence = () => this.persistence(this.ctx);

    if (!ownerField) {
      const result = await handler.apply(this, args);
      return isSingle
        ? stripSingle(result, "", ownerField, writeOnly, ModelConstr)
        : stripList(result, "", ownerField, writeOnly);
    }

    // create / createAll ALWAYS stamp the owner from the authenticated principal.
    // A client-supplied owner value is never trusted when the model is
    // owner-scoped: the owner is derived from the authenticated principal, so a
    // caller cannot create a resource owned by (or claiming to be) another
    // principal.
    if (methodName === "create" && args[0] && typeof args[0] === "object") {
      args[0][ownerField] = principal;
    }
    if (methodName === "createAll" && Array.isArray(args[0])) {
      for (const item of args[0]) {
        if (item && typeof item === "object") item[ownerField] = principal;
      }
    }

    // update / updateAll can never set a write-only field (secret is write-only).
    if (methodName === "update" && args[0]) {
      for (const field of writeOnly) Reflect.deleteProperty(args[0], field);
    } else if (methodName === "updateAll" && Array.isArray(args[0])) {
      for (const item of args[0]) {
        if (!item) continue;
        for (const field of writeOnly) Reflect.deleteProperty(item, field);
      }
    }

    // Pre-assert ownership before any mutation on update/delete.
    if (methodName === "update" || methodName === "delete") {
      const routeParams =
        methodName === "update" ? args.slice(1) : (args as any[]);
      const id = getPK
        ? getPK(...(routeParams as Array<string | number>))
        : (routeParams[0] as string);
      const current = await persistence().read(id, this.ctx);
      assertOwnership(principal, current, outboundKind(ModelConstr));
    }

    // updateAll: each item carries its own primary key. Pre-assert ownership on
    // EVERY target before any mutation so a foreign-owned item rejects the whole
    // batch with 403 (AuthorizationError) instead of being silently dropped from
    // the response. This closes the mass-IDOR where a mixed/foreign bulk payload
    // persisted tampered rows without ever rejecting.
    if (methodName === "updateAll" && Array.isArray(args[0])) {
      const pkField = Model.pk(ModelConstr) as string;
      for (const item of args[0]) {
        if (!item || typeof item !== "object") continue;
        const itemId = (item as Record<string, unknown>)[pkField];
        if (itemId === undefined || itemId === null) continue;
        const current = await persistence().read(itemId, this.ctx);
        assertOwnership(principal, current, outboundKind(ModelConstr));
      }
    }

    // deleteAll: pre-assert ownership on EVERY target id before deletion so a
    // foreign-owned row is rejected with 403 (AuthorizationError) rather than
    // silently filtered out of the deletion. This closes the mass-IDOR where a
    // caller could delete another principal's rows by id.
    if (methodName === "deleteAll" && args[0] != null) {
      const ids = normalizeBulkIds(args[0] as string | string[]);
      for (const id of ids) {
        const current = await persistence().read(id, this.ctx);
        assertOwnership(principal, current, outboundKind(ModelConstr));
      }
    }

    const result = await handler.apply(this, args);

    return isSingle
      ? stripSingle(result, principal, ownerField, writeOnly, ModelConstr)
      : stripList(result, principal, ownerField, writeOnly);
  };
}
