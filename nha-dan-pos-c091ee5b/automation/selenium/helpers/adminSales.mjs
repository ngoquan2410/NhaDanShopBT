/**
 * Phase 4 admin sales: dashboard inventory math parity + guest quote/pending helpers.
 */
import { By, until } from "selenium-webdriver";

const EXPIRY_SOON_DAYS = 30;

const STD_ADDR = Object.freeze({
  receiverName: "e2e-guest",
  phone: "0912345678",
  provinceCode: "79",
  provinceName: "Ho Chi Minh",
  districtCode: "1442",
  districtName: "Quan 1",
  wardCode: "21211",
  wardName: "Ben Nghe",
  street: "99 E2E",
  note: null,
});

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseYmd(iso) {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso.slice(0, 10));
  return Number.isFinite(d.getTime()) ? d : null;
}

/**
 * Mirrors `Dashboard.tsx` stock/expiry rollup from `GET /api/inventory/projections`.
 *
 * @param {unknown[]} projections
 */
export function dashboardAlertsFromProjections(projections, today = new Date()) {
  /** @type {number} */
  let lowStockCount = 0;
  /** @type {number} */
  let outOfStockCount = 0;
  /** @type {number} */
  let nearExpiryCount = 0;
  /** @type {number} */
  let expiredCount = 0;

  const t0 = startOfDay(today);
  const soonUntil = new Date(t0);
  soonUntil.setDate(soonUntil.getDate() + EXPIRY_SOON_DAYS);

  for (const raw of projections) {
    /** @type {Record<string, unknown>} */
    const v =
      typeof raw === "object" && raw !== null ? /** @type {Record<string, unknown>} */ (raw) : {};

    const sellableRaw = v.sellableQty;
    const physicalStockRow = sellableRaw != null && sellableRaw !== "";
    const avail = physicalStockRow
      ? Number(sellableRaw ?? v.available ?? v.onHand ?? 0)
      : Number(v.available ?? v.onHand ?? 0);
    const minStock = v.minStockQty != null ? Number(v.minStockQty) : 10;

    if (physicalStockRow) {
      if (avail <= 0) {
        outOfStockCount++;
      } else if (avail > 0 && avail <= minStock) {
        lowStockCount++;
      }
    }

    const batches = Array.isArray(v.byBatch) ? v.byBatch : [];
    for (const b of batches) {
      const bb = typeof b === "object" && b !== null ? b : {};
      const expRaw = bb.expiryDate;
      const exp =
        typeof expRaw === "string" ? parseYmd(expRaw) : expRaw instanceof Date ? expRaw : null;
      if (!exp) continue;
      if (exp < t0) {
        expiredCount++;
      } else if (exp <= soonUntil) {
        nearExpiryCount++;
      }
    }
  }

  return { lowStockCount, outOfStockCount, nearExpiryCount, expiredCount };
}

/**
 * Mirrors admin dashboard slice: Spring page 0-based, BE sort `createdAt,desc`,
 * dashboard requests `pageSize: 12` then filters statuses on that page only (same quirk as FE).
 */
export function pendingOpenFromDashboardSlice(pendingOrdersPagePayload) {
  const items = pendingOrdersPagePayload?.content ?? [];
  return items.filter(
    /** @param {Record<string, unknown>} o */
    (o) =>
      o.status === "pending_payment" ||
      o.status === "waiting_confirm" ||
      o.status === "paid_auto",
  ).length;
}

/**
 * @param {unknown[]} projections from `GET /api/inventory/projections`
 * @param {{ minAvail?: number }} [opts] default `minAvail: 1` — use `2` for POS qty-stress paths under `AUTOMATION_NO_SKIP`.
 */
export function pickSellableVariantScan(projections, opts = {}) {
  const minAvail = typeof opts.minAvail === "number" && opts.minAvail > 0 ? opts.minAvail : 1;
  for (const raw of projections) {
    /** @type {Record<string, unknown>} */
    const p =
      typeof raw === "object" && raw !== null ? /** @type {Record<string, unknown>} */ (raw) : {};

    // COMBO rows use sellableQty=null (virtual stock). Barcode/POS/guest-quote flows need a SINGLE SKU.
    if (p.sellableQty === null || p.sellableQty === undefined) continue;

    const code = String(p.variantCode ?? "").trim();
    const pid = Number(p.productId ?? 0);
    const vid = Number(p.variantId ?? 0);
    const avail = Number(p.sellableQty ?? p.available ?? p.onHand ?? 0);

    /** Prefer server FEFO — avoids combo+batchId rejection and stale first-batch coupling on storefront quote. */
    const batchId = null;

    if (code && vid > 0 && pid > 0 && avail >= minAvail) {
      return { productId: pid, variantId: vid, variantCode: code, batchId };
    }
  }
  return null;
}


/**
 * POS barcode field is React-controlled; HID mode + Selenium sendKeys is flaky in headless.
 * Switch to manual mode, inject value + InputEvent, then click "Thêm mã vạch".
 *
 * @param {import('selenium-webdriver').WebDriver} driver
 * @param {string} variantCode
 */
export async function posScanInManualMode(driver, variantCode) {
  await driver.wait(until.elementLocated(By.css('[aria-label="Ô nhập mã vạch"]')), 25000);
  const manualBtn = await driver.findElement(By.css('button[title="Thủ công"]'));
  await manualBtn.click();
  await driver.sleep(250);
  await driver.executeScript(
    `
    const el = document.querySelector('[aria-label="Ô nhập mã vạch"]');
    if (!el) throw new Error('barcode input missing');
    const v = arguments[0];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertFromPaste', data: v }));
    `,
    variantCode,
  );
  const addBtn = await driver.wait(
    until.elementLocated(By.xpath('//button[contains(normalize-space(.), "Thêm mã vạch")]')),
    10000,
  );
  await addBtn.click();
  await driver.sleep(900);
}

/** Guest storefront quote + COD/bank-transfer pending row (anonymous HTTP). */
export async function createGuestPendingViaQuote(
  api,
  projectionPick,
  suffix,
  { paymentMethod = "bank_transfer" } = {},
) {
  const prevTok = api.getAccessToken();
  api.setAccessToken(null);

  try {
    const line = {
      productId: projectionPick.productId,
      variantId: projectionPick.variantId,
      quantity: 1,
      discountPercent: 0,
      batchId: null,
      rewardLine: false,
    };

    const quoteReq = {
      source: "storefront",
      customerId: null,
      promotionId: null,
      voucherCode: null,
      shippingQuoteSnapshot: null,
      manualDiscount: null,
      requestedRedeemPoints: null,
      vatPercent: 0,
      lines: [line],
      shippingAddress: STD_ADDR,
    };

    const quoteBody = await api.fetchJson("/api/sales/quote", {
      method: "POST",
      json: quoteReq,
    });
    const quoteId = quoteBody.quoteId ?? quoteBody.quotePublicId;

    const pendReq = {
      customerId: null,
      customerName: `AUTO-SEL-${suffix}`,
      customerPhone: "0977000999",
      shippingAddress: STD_ADDR,
      note: "admin-sales-suite automation",
      paymentMethod,
      lines: null,
      promotionSnapshot: null,
      voucherSnapshot: null,
      shippingQuoteSnapshot: null,
      pricingBreakdownSnapshot: null,
      expiresAt: null,
      quotePublicId: String(quoteId),
    };

    const created = await api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: pendReq,
    });

    const idRaw = created.id;
    const id = typeof idRaw === "bigint" ? idRaw.toString() : String(idRaw);
    return {
      numericId: Number(idRaw),
      id,
      customerName: String(created.customerName ?? pendReq.customerName),
    };
  } finally {
    api.setAccessToken(prevTok);
  }
}
