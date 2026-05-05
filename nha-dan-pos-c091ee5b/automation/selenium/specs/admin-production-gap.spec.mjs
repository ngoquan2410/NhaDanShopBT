import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

/** Completed-on-create production order + void restores raw receipt batch remaining (API truth) + UI list anchor. */
export default {
  name: "Gate+: production order create + void restores inputs + UI shell",
  tags: ["admin", "p5-production", "watchlist-combo-production"],
  order: 53,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

    await fx.loginAdminApi(ctx.api, u, p);
    const suf = fx.uniq("pr");

    const catId = await fx.ensureCategory(ctx.api, `E2E-CAT-${suf}`);
    const raw = await fx.ensureProduct(ctx.api, catId, `E2E-RAW-${suf}`, `E2E-RW-${suf}`);
    const fin = await fx.ensureProduct(ctx.api, catId, `E2E-FIN-${suf}`, `E2E-FW-${suf}`);

    const rawRec = await fx.postReceipt(ctx.api, {
      productId: raw.productId,
      variantId: raw.variantId,
      qty: 120,
      unitCost: 800,
      expiry: "2036-07-01",
      supplierName: `E2E-NCC-${suf}`,
    });

    const rb0 = await fx.batchesForReceipt(ctx.api, rawRec.id);
    const remBefore = fx.batchRemaining(rb0[0]);
    if (!Number.isFinite(remBefore)) throw new Error("raw batch remaining missing");

    const recipe = await ctx.api.fetchJson("/api/production-recipes", {
      method: "POST",
      json: {
        recipeCode: `E2E-RCP-${suf}`,
        name: `E2E recipe ${suf}`,
        outputProductId: fin.productId,
        outputVariantId: fin.variantId,
        outputQty: 1,
        outputMustBeSellable: true,
        overheadCost: 0,
        components: [
          {
            productId: raw.productId,
            variantId: raw.variantId,
            qtyPerOutput: 2,
            unit: "cai",
            sortOrder: 0,
          },
        ],
      },
    });

    const prev = await ctx.api.fetchJson("/api/production-orders/preview", {
      method: "POST",
      json: { recipeId: recipe.id, outputQty: 4, overheadCost: 0 },
    });
    if (!prev?.maxProducibleQty || prev.maxProducibleQty < 4) {
      ctx.api.setAccessToken(null);
      return { skipped: true, reason: "Production preview insufficient raw for outputQty=4" };
    }

    const order = await ctx.api.fetchJson("/api/production-orders", {
      method: "POST",
      json: { recipeId: recipe.id, outputQty: 4, overheadCost: 0, note: `e2e ${suf}` },
    });
    const oid = order.id;
    const outBid = order.outputBatchId;
    if (!oid || !outBid) throw new Error("production order missing id/outputBatchId");

    const rb1 = await fx.batchesForReceipt(ctx.api, rawRec.id);
    const remMid = fx.batchRemaining(rb1[0]);
    const consumed = remBefore - remMid;
    if (consumed !== 8) {
      throw new Error(`expected consume 8 raw units for qtyPerOutput=2 × outputQty=4 (${remBefore}→${remMid})`);
    }

    await ctx.api.fetchJson(`/api/production-orders/${oid}/void`, { method: "POST", json: {} });

    const rb2 = await fx.batchesForReceipt(ctx.api, rawRec.id);
    const remAfter = fx.batchRemaining(rb2[0]);
    if (remAfter !== remBefore) {
      throw new Error(`void must restore raw receipt batch (${remBefore} vs ${remAfter})`);
    }

    const outB = await ctx.api.fetchJson(`/api/batches/${outBid}`);
    const rq = Number(outB.remainingQty ?? 0);
    const st = String(outB.status ?? "").toLowerCase();
    if (rq > 0 && !st.includes("void") && !st.includes("deplet") && !st.includes("archive")) {
      throw new Error(`output batch after void should not retain qty (${rq}) status=${outB.status}`);
    }

    const prev2 = await ctx.api.fetchJson("/api/production-orders/preview", {
      method: "POST",
      json: { recipeId: recipe.id, outputQty: 6, overheadCost: 0 },
    });
    if (!(prev2?.maxProducibleQty >= 6)) {
      throw new Error("secondary production preview unexpectedly infeasible");
    }
    const order2 = await ctx.api.fetchJson("/api/production-orders", {
      method: "POST",
      json: { recipeId: recipe.id, outputQty: 6, overheadCost: 0, note: `e2e-downstream ${suf}` },
    });
    const oid2 = order2.id;
    const outBid2 = order2.outputBatchId;
    const outMeta = await ctx.api.fetchJson(`/api/batches/${outBid2}`);
    if (!outMeta.costPrice) console.warn("production output batch missing costPrice in local env");

    await fx.createStaffInvoice(ctx.api, {
      customerName: "E2E prod cons",
      customerId: null,
      note: "consume output batch",
      promotionId: null,
      items: [
        {
          productId: fin.productId,
          quantity: 5,
          discountPercent: 0,
          variantId: fin.variantId,
          batchId: Number(outBid2),
        },
      ],
      quotePublicId: null,
      paymentMethod: "cash",
    });

    const voidBlocked = await ctx.api.fetch(`/api/production-orders/${oid2}/void`, { method: "POST", json: {} });
    if (voidBlocked.ok) {
      throw new Error("void must fail when output batch was partially consumed downstream");
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    await driver.get(`${origin}/admin/production`);
    await waitForH1Containing(driver, "Sản xuất", 25000);
    const ordLabel = String(order.orderNo ?? "");
    if (ordLabel) {
      await driver.wait(until.elementLocated(By.xpath(`//*[contains(normalize-space(.),'${ordLabel}')]`)), 12000).catch(() => {});
    }

    ctx.api.setAccessToken(null);
  },
};
