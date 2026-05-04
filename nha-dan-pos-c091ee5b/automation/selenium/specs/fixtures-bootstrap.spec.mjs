/**
 * Chạy trước các spec khi AUTOMATION_SCOPE=full|regression (scopeTags rỗng → mọi spec đều chạy).
 * Tag `fixtures-bootstrap` không thuộc `smoke`.
 *
 * Seed: category + 2 SP + phiếu nhập + combo active → /api/combos/active có dữ liệu
 * để storefront /combos hiện hero có h1 "Combo gia đình — ..." (Combos.tsx).
 */
import { pickSellableVariantScan } from "../helpers/adminSales.mjs";

const CAT_NAME = "E2E Automation";
const PROD_MAIN_CODE = "E2E-AUTO-STK";
const PROD_COMP_CODE = "E2E-AUTO-COMP";
const STOREFRONT_USER = "sf_e2e_customer";
const STOREFRONT_PASSWORD = "Auto_e2e_9!PassOk";

const COMBO_LISTING_NAME = "Combo cửa hàng E2E";
const BARCODE_MAIN = "8936049999901";
const BARCODE_COMP = "8936049999902";
const MAIN_MIN_STOCK = 50;
const COMP_MIN_STOCK = 15;
const RECEIPT_UNITS = 100;

function receiptNowIso() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - 5);
  return d.toISOString().slice(0, 19);
}

async function findProductByCode(api, code) {
  const page = await api.fetchJson(
    `/api/products?search=${encodeURIComponent(code)}&includeInactive=true&size=50&sort=name`,
  );
  const rows = page.content ?? [];
  return rows.find((r) => String(r.code) === code) ?? null;
}

async function ensureCategory(api) {
  const list = await api.fetchJson("/api/categories?includeInactive=true");
  const existing = Array.isArray(list) ? list.find((c) => c.name === CAT_NAME) : null;
  if (existing?.id) return existing.id;
  const created = await api.fetchJson("/api/categories", {
    method: "POST",
    json: { name: CAT_NAME, description: "E2E seed", active: true },
  });
  return created.id;
}

async function ensureSingleProduct(api, categoryId, code, variantCode, variantName) {
  let p = await findProductByCode(api, code);
  if (!p) {
    p = await api.fetchJson("/api/products", {
      method: "POST",
      json: {
        code,
        name: `${code} seed`,
        categoryId,
        active: true,
        productType: "SINGLE",
        initialVariants: [
          {
            variantCode,
            variantName,
            sellUnit: "cai",
            importUnit: "cai",
            piecesPerUnit: 1,
            sellPrice: 15000,
            costPrice: 8000,
            stockQty: 0,
            minStockQty: 3,
            expiryDays: 365,
            isDefault: true,
            isSellable: true,
            active: true,
          },
        ],
      },
    });
  }
  const variants = p.variants ?? [];
  const def = variants[0];
  if (!def?.id) throw new Error(`Product ${code} missing variant`);
  return { productId: p.id, variantId: def.id, variantCode };
}

async function ensureReceiptStock(api, productId, variantId, noteSuffix) {
  const body = {
    supplierName: `E2E-NCC-${noteSuffix}`,
    supplierId: null,
    note: "fixtures-bootstrap",
    shippingFee: 0,
    vatPercent: 0,
    comboItems: [],
    items: [
      {
        productId,
        quantity: RECEIPT_UNITS,
        unitCost: 5000,
        discountPercent: 0,
        importUnit: "cai",
        piecesOverride: 1,
        variantId,
        expiryDateOverride: "2035-12-31",
      },
    ],
    receiptDate: receiptNowIso(),
  };
  await api.fetchJson("/api/receipts", { method: "POST", json: body });
}

async function variantAvailable(api, variantId) {
  const projections = await api.fetchJson("/api/inventory/projections");
  if (!Array.isArray(projections)) return 0;
  const row = projections.find((r) => Number(r.variantId) === Number(variantId));
  return Number(row?.available ?? row?.onHand ?? 0);
}

async function ensureMinStock(api, productId, variantId, minAvail, label) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const avail = await variantAvailable(api, variantId);
    if (avail >= minAvail) return;
    await ensureReceiptStock(api, productId, variantId, `${label}-${attempt}-${Date.now()}`);
  }
  const final = await variantAvailable(api, variantId);
  throw new Error(`fixtures-bootstrap: variant ${variantId} stuck at ${final}, need ${minAvail}`);
}

async function ensureStorefrontUser(apiBaseUrl) {
  const origin = apiBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${origin}/api/auth/signup`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      username: STOREFRONT_USER,
      password: STOREFRONT_PASSWORD,
      fullName: "E2E Storefront",
    }),
  });
  if (res.ok) return;
  const text = await res.text();
  if (res.status === 400 || res.status === 409 || res.status === 422) {
    if (/tồn tại|already|exists|duplicate/i.test(text)) return;
  }
  throw new Error(`fixtures-bootstrap: signup ${STOREFRONT_USER} HTTP ${res.status}: ${text.slice(0, 240)}`);
}

async function ensureCombo(api, categoryId, mainProductId, compProductId) {
  const adminList = await api.fetchJson("/api/combos");
  const combos = Array.isArray(adminList) ? adminList : [];
  const hit = combos.find((c) => c.name === COMBO_LISTING_NAME && c.active !== false);
  if (hit?.id) return hit.id;

  await api.fetchJson("/api/combos", {
    method: "POST",
    json: {
      code: null,
      name: COMBO_LISTING_NAME,
      description: "E2E automation combo",
      sellPrice: 25000,
      active: true,
      categoryId,
      items: [
        { productId: mainProductId, quantity: 1 },
        { productId: compProductId, quantity: 1 },
      ],
    },
  });
  return null;
}

export default {
  name: "Bootstrap: stock + combo for full automation (non-smoke)",
  tags: ["fixtures-bootstrap"],
  order: -100,
  async run(_driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "ADMIN credentials required for fixtures-bootstrap" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const tok = login.accessToken;
    ctx.api.setAccessToken(typeof tok === "string" ? tok : String(tok));

    const catId = await ensureCategory(ctx.api);

    const main = await ensureSingleProduct(ctx.api, catId, PROD_MAIN_CODE, BARCODE_MAIN, "E2E Main");
    const comp = await ensureSingleProduct(ctx.api, catId, PROD_COMP_CODE, BARCODE_COMP, "E2E Comp");

    await ensureMinStock(ctx.api, main.productId, main.variantId, MAIN_MIN_STOCK, "main");
    await ensureMinStock(ctx.api, comp.productId, comp.variantId, COMP_MIN_STOCK, "comp");

    await ensureCombo(ctx.api, catId, main.productId, comp.productId);

    ctx.api.setAccessToken(null);
    await ensureStorefrontUser(ctx.config.apiBaseUrl);

    const loginTok = await ctx.api.authLoginJson(u, p);
    ctx.api.setAccessToken(
      typeof loginTok.accessToken === "string" ? loginTok.accessToken : String(loginTok.accessToken),
    );

    const activeRes = await fetch(
      `${ctx.config.apiBaseUrl.replace(/\/$/, "")}/api/combos/active`,
      { headers: { Accept: "application/json" } },
    );
    if (!activeRes.ok) {
      throw new Error(`fixtures-bootstrap: /api/combos/active HTTP ${activeRes.status}`);
    }
    const active = await activeRes.json();
    if (!Array.isArray(active) || active.length < 1) {
      throw new Error("fixtures-bootstrap: /api/combos/active still empty after seed");
    }

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections) : null;
    if (!pick?.variantCode) {
      throw new Error("fixtures-bootstrap: projections still lack sellable line after seed");
    }

    ctx.api.setAccessToken(null);
  },
};
