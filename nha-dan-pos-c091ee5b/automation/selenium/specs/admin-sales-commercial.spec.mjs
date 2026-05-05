import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

function isoStartOfToday() {
  const t0 = new Date();
  return new Date(t0.getFullYear(), t0.getMonth(), t0.getDate(), 0, 0, 0).toISOString().slice(0, 19);
}

function isoPlusDays(days) {
  const t0 = new Date();
  const x = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + days, 23, 59, 0);
  return x.toISOString().slice(0, 19);
}

/**
 * Seeds promotion + voucher, runs POS quote (manual discount + VAT), materializes invoice from quote,
 * asserts commercial snapshot + inventory movement, cancels to restore batch remaining, opens admin invoices UI.
 */
export default {
  name: "Gate+: commercial quote → invoice (promo/voucher/manual/VAT) + cancel batch restore + UI",
  tags: ["admin", "admin-sales-suite", "watchlist-pos-invoice", "watchlist-revenue-profit"],
  order: 57,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

    await fx.loginAdminApi(ctx.api, u, p);
    const suf = fx.uniq("com");
    const catId = await fx.ensureCategory(ctx.api, `E2E-CAT-${suf}`);
    const { productId, variantId } = await fx.ensureProduct(ctx.api, catId, `E2E-COM-${suf}`, `E2E-CMV-${suf}`);

    const rec = await fx.postReceipt(ctx.api, {
      productId,
      variantId,
      qty: 61,
      unitCost: 3000,
      expiry: "2036-06-06",
      supplierName: `E2E-NCC-${suf}`,
    });
    const bb = await fx.batchesForReceipt(ctx.api, rec.id);
    const rem0 = fx.batchRemaining(bb[0]);

    const start = isoStartOfToday();
    const end = isoPlusDays(90);

    const promo = await ctx.api.fetchJson("/api/promotions", {
      method: "POST",
      json: {
        name: `E2E-PROM-${suf}`,
        description: "gap-close selenium",
        type: "PERCENT_DISCOUNT",
        discountValue: "8",
        minOrderValue: "0",
        maxDiscount: null,
        startDate: start,
        endDate: end,
        appliesTo: "ALL",
        categoryIds: [],
        productIds: [],
        active: true,
        buyQty: null,
        getProductId: null,
        getQty: null,
        minBuyQty: null,
        maxBuyQty: null,
      },
    });

    const vCode = `E2E${`${suf}-${Date.now()}`.replace(/\W/g, "").toUpperCase().slice(0, 16)}`;

    const voucher = await ctx.api.fetchJson("/api/vouchers", {
      method: "POST",
      json: {
        code: vCode,
        ruleSummary: "e2e pct",
        active: true,
        minSubtotal: "0",
        percent: "6",
        cap: null,
        fixedAmount: null,
        freeShipping: false,
        startAt: start,
        endAt: end,
      },
    });
    void voucher;

    const quote = await ctx.api.fetchJson("/api/sales/quote", {
      method: "POST",
      json: {
        source: "pos",
        customerId: null,
        lines: [
          {
            productId,
            variantId,
            quantity: 4,
            discountPercent: 4,
            batchId: null,
            rewardLine: false,
          },
        ],
        promotionId: promo.id,
        voucherCode: vCode,
        shippingQuoteSnapshot: null,
        shippingAddress: null,
        manualDiscount: 12000,
        vatPercent: 10,
        requestedRedeemPoints: null,
      },
    });
    const qid = quote.quoteId ? String(quote.quoteId) : "";
    const pb = quote.pricingBreakdownSnapshot;
    if (!qid) throw new Error("quote missing quoteId");
    if (!pb || fx.toNum(pb.total) <= 0) throw new Error("quote missing pricing breakdown totals");

    const inv = await ctx.api.fetchJson("/api/invoices", {
      method: "POST",
      json: {
        customerName: "E2E commercial",
        customerId: null,
        note: "selenium commercial",
        promotionId: null,
        items: [],
        quotePublicId: qid,
        paymentMethod: "cash",
      },
    });
    const invNo = String(inv.invoiceNo ?? "");
    if (!invNo) throw new Error("invoice missing number");

    const loaded = await ctx.api.fetchJson(`/api/invoices/${inv.id}`);
    const line0 = loaded.items?.[0];
    const pb2 = loaded.pricingBreakdownSnapshot;
    if (!line0?.commercialSnapshot || !pb2) {
      throw new Error("invoice missing commercial snapshot rows");
    }
    const netRev = fx.toNum(pb2.itemNetRevenue ?? pb.itemNetRevenue);
    const cogs = fx.toNum(loaded.itemCogs);
    const profit = fx.toNum(loaded.itemGrossProfit);
    if (!(Number.isFinite(netRev) && netRev > 0)) throw new Error("item revenue missing");
    if (!(Number.isFinite(cogs) && cogs >= 0)) throw new Error("COGS snapshot missing");
    if (!(Number.isFinite(profit) && Math.abs(profit - (netRev - cogs)) < 50)) {
      throw new Error(`profit ≈ revenue-COGS mismatch (${profit} vs ${netRev - cogs})`);
    }
    const vatPct = fx.toNum(loaded.vatPercent ?? pb2.vatPercent ?? NaN);
    if (!(vatPct >= 0)) throw new Error("VAT percent missing");

    const remAfterSale = fx.batchRemaining((await fx.batchesForReceipt(ctx.api, rec.id))[0]);
    ctx.seed.registerCleanup(async () => {
      try {
        await ctx.api.fetch(`/api/invoices/${inv.id}/cancel`, { method: "PATCH", json: {} });
      } catch {
        /* noop */
      }
    });

    await ctx.api.fetch(`/api/invoices/${inv.id}/cancel`, { method: "PATCH", json: {} });

    const remRestore = fx.batchRemaining((await fx.batchesForReceipt(ctx.api, rec.id))[0]);
    if (remRestore !== rem0 || remAfterSale !== rem0 - 4) {
      throw new Error(
        `cancel must restore receipts batch (start ${rem0}, after sale ${remAfterSale}, after cancel ${remRestore})`,
      );
    }
    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    await driver.get(`${origin}/admin/invoices?q=${encodeURIComponent(invNo)}`);
    await waitForH1Containing(driver, "Hóa đơn", 20000);
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(normalize-space(.),'${invNo}')]`)), 20000);

    ctx.api.setAccessToken(null);
  },
};
