/**
 * Deterministic API fixtures with `E2E-*` prefixes for Selenium cross-checks.
 * Pair mutations with ctx.seed.registerCleanup where invoices/receipts need teardown.
 */

/**
 * @param {ReturnType<import('./api.mjs').createApiHelper>} api
 */
export async function loginAdminApi(api, username, password) {
  const body = await api.authLoginJson(username, password);
  const tok = body.accessToken;
  if (!tok) throw new Error("login missing accessToken");
  api.setAccessToken(typeof tok === "string" ? tok : String(tok));
}

export function uniq(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {ReturnType<import('./api.mjs').createApiHelper>} api
 */
export async function ensureCategory(api, name) {
  const list = await api.fetchJson("/api/categories?includeInactive=true");
  const existing = Array.isArray(list) ? list.find((c) => c.name === name) : null;
  if (existing?.id) return existing.id;
  const created = await api.fetchJson("/api/categories", {
    method: "POST",
    json: { name, description: "E2E selenium", active: true },
  });
  return created.id;
}

/**
 * @returns {{ productId: number, variantId: number }}
 */
export async function ensureProduct(api, categoryId, code, variantCode, opts = {}) {
  const sellPrice = opts.sellPrice ?? 12000;
  const costPrice = opts.costPrice ?? 6000;
  const isSellable = opts.isSellable !== false;
  const search = await api.fetchJson(
    `/api/products?search=${encodeURIComponent(code)}&includeInactive=true&size=30`,
  );
  const rows = search.content ?? [];
  const hit = rows.find((r) => String(r.code).toUpperCase() === String(code).toUpperCase());
  if (hit?.id) {
    const v = hit.variants?.[0];
    if (!v?.id) throw new Error(`existing product ${code} missing variant`);
    return { productId: Number(hit.id), variantId: Number(v.id) };
  }
  const created = await api.fetchJson("/api/products", {
    method: "POST",
    json: {
      code,
      name: `${code} E2E`,
      categoryId,
      active: true,
      productType: "SINGLE",
      initialVariants: [
        {
          variantCode,
          variantName: "E2E variant",
          sellUnit: "cai",
          importUnit: "cai",
          piecesPerUnit: 1,
          sellPrice,
          costPrice,
          stockQty: 0,
          minStockQty: 1,
          expiryDays: 365,
          isDefault: true,
          isSellable,
          active: true,
        },
      ],
    },
  });
  const def = created.variants?.[0];
  if (!def?.id) throw new Error(`create ${code} missing variant`);
  return { productId: Number(created.id), variantId: Number(def.id) };
}

export function receiptNowIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 6);
  return d.toISOString().slice(0, 19);
}

/**
 * @returns {Promise<Record<string, unknown>>}
 */
export async function postReceipt(api, { productId, variantId, qty, unitCost, expiry, supplierName, note }) {
  return api.fetchJson("/api/receipts", {
    method: "POST",
    json: {
      supplierName,
      supplierId: null,
      note: note ?? "e2e-gap",
      shippingFee: 0,
      vatPercent: 0,
      comboItems: [],
      items: [
        {
          productId,
          quantity: qty,
          unitCost,
          discountPercent: 0,
          importUnit: "cai",
          piecesOverride: 1,
          variantId,
          expiryDateOverride: expiry,
        },
      ],
      receiptDate: receiptNowIso(),
    },
  });
}

export async function batchesForReceipt(api, receiptId) {
  const rows = await api.fetchJson(`/api/batches/receipt/${receiptId}`);
  return Array.isArray(rows) ? rows : [];
}

export function projectionForVariant(rows, variantId) {
  const list = Array.isArray(rows) ? rows : [];
  return list.find((r) => Number(r.variantId) === Number(variantId)) ?? null;
}

/** Prefer physical/on-hand style fields used by InventoryProjection JSON. */
export function projectionQty(row, field = "available") {
  if (!row || typeof row !== "object") return NaN;
  const v = /** @type {Record<string, unknown>} */ (row);
  const primary = Number(v[field]);
  if (Number.isFinite(primary)) return primary;
  return Number(v.onHand ?? v.stockQty ?? NaN);
}

/** Sum projection.byBatch[].qty when present (admin projection payload). */
export function sumProjectionBatchQty(row) {
  if (!row || typeof row !== "object") return NaN;
  const batches = /** @type {Record<string, unknown>} */ (row).byBatch;
  if (!Array.isArray(batches)) return NaN;
  let s = 0;
  for (const b of batches) {
    const bb = typeof b === "object" && b !== null ? b : {};
    s += Number(/** @type {Record<string, unknown>} */ (bb).qty ?? 0);
  }
  return s;
}

export function batchRemaining(batchRow) {
  if (!batchRow || typeof batchRow !== "object") return NaN;
  return Number(/** @type {Record<string, unknown>} */ (batchRow).remainingQty ?? NaN);
}

/**
 * @param {ReturnType<import('./api.mjs').createApiHelper>} api
 */
export async function ensureSupplier(api, name) {
  const rows = await api.fetchJson(`/api/suppliers?q=${encodeURIComponent(name)}`);
  const list = Array.isArray(rows) ? rows : [];
  const existing = list.find((s) => String(s.name) === name);
  if (existing?.id) return { id: Number(existing.id), name: String(existing.name) };
  const created = await api.fetchJson("/api/suppliers", {
    method: "POST",
    json: { name, active: true, phone: "0900000002", address: "E2E automation" },
  });
  return { id: Number(created.id), name: String(created.name ?? name) };
}

/** Physical truth: projection.onHand equals sum(byBatch[].qty) when batches are present. */
export function assertProjectionPhysicalMatchesBatches(proj) {
  if (!proj || typeof proj !== "object") throw new Error("missing projection row");
  const row = /** @type {Record<string, unknown>} */ (proj);
  const batches = row.byBatch;
  if (!Array.isArray(batches) || batches.length === 0) return;
  const sum = sumProjectionBatchQty(proj);
  const oh = Number(row.onHand);
  if (!(Number.isFinite(sum) && Number.isFinite(oh)) || sum !== oh) {
    throw new Error(`projection invariant: onHand=${oh}, sum(byBatch.qty)=${sum}`);
  }
}

/**
 * @param {ReturnType<import('./api.mjs').createApiHelper>} api
 */
export async function fetchProductVariants(api, productId) {
  const p = await api.fetchJson(`/api/products/${productId}?includeInactive=true`);
  const vs = Array.isArray(p.variants) ? p.variants : [];
  return { product: p, variants: vs };
}

/**
 * @param {ReturnType<import('./api.mjs').createApiHelper>} api
 */
export async function createStaffInvoice(api, payload) {
  /** @type {Record<string, unknown>} */
  const body =
    typeof payload === "object" && payload !== null ? /** @type {Record<string, unknown>} */ (payload) : {};
  return api.fetchJson("/api/invoices", { method: "POST", json: body });
}

/**
 * FEFO sell 1 unit: no batch hint on line (batchId omitted / null).
 * @param {ReturnType<import('./api.mjs').createApiHelper>} api
 */
export async function sellVariantOneFefo(api, productId, variantId) {
  return createStaffInvoice(api, {
    customerName: "E2E FEFO",
    customerId: null,
    note: "e2e fefo",
    promotionId: null,
    items: [
      {
        productId,
        quantity: 1,
        discountPercent: 0,
        variantId,
        batchId: null,
      },
    ],
    quotePublicId: null,
    paymentMethod: "cash",
  });
}

/**
 * @param {BigDecimal-ish} x
 */
export function toNum(x) {
  if (x == null) return NaN;
  if (typeof x === "number") return x;
  const n = Number(String(x));
  return n;
}
