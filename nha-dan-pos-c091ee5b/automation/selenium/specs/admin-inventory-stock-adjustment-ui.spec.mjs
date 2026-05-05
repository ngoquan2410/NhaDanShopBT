import { By, Key, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

/**
 * UI: search line + confirm positive Δ (projection delta).
 * API: oversized source-batch confirm rejects; consumption on created batch blocks reverse (legacy/trace).
 * API+UI: exact-batch −Δ + drawer reverse + duplicate reverse HTTP rejection.
 */
export default {
  name: "Gate+: stock adjustment UI confirm + reversals/reject paths",
  tags: ["admin", "p5-inventory", "watchlist-receipts-adjustments", "watchlist-inventory-truth"],
  order: 59,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

    await fx.loginAdminApi(ctx.api, u, p);
    const suf = fx.uniq("adj");
    const catId = await fx.ensureCategory(ctx.api, `E2E-CAT-${suf}`);

    /** A — UI happy path (+2) */
    const uiP = await fx.ensureProduct(ctx.api, catId, `E2E-AUI-${suf}`, `E2E-AUV-${suf}`);
    await fx.postReceipt(ctx.api, {
      productId: uiP.productId,
      variantId: uiP.variantId,
      qty: 40,
      unitCost: 3000,
      expiry: "2036-06-01",
      supplierName: `E2E-NCC-${suf}`,
    });
    const projUi0 = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), uiP.variantId);
    const sysUi = Number(projUi0.onHand ?? projUi0.available ?? NaN);

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/stock-adjustments/create`);
    await driver.wait(until.elementLocated(By.css('[data-testid="stock-adj-product-search"]')), 25000);

    await driver.findElement(By.css('[data-testid="stock-adj-product-search"]')).sendKeys(`E2E-AUV-${suf}`);
    await driver.wait(until.elementLocated(By.css('[data-testid="stock-adj-search-suggestions"] li button')), 15000);
    await driver.findElement(By.css('[data-testid="stock-adj-search-suggestions"] li button')).click();

    const actualInp = await driver.wait(until.elementLocated(By.css('[data-testid="stock-adj-line-actual-qty"]')), 10000);
    // Controlled React input — native value setter skips React state; use keyboard input.
    await actualInp.click();
    await actualInp.sendKeys(Key.chord(Key.CONTROL, "a"));
    await actualInp.sendKeys(Key.DELETE);
    await actualInp.sendKeys(String(sysUi + 2));

    await driver.findElement(By.css('[data-testid="stock-adj-confirm-open"]')).click();
    const cbtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(normalize-space(.),'Xác nhận điều chỉnh')]")),
      10000,
    );
    await cbtn.click();
    await driver.wait(async () => {
      const url = await driver.getCurrentUrl();
      return url.includes("/admin/stock-adjustments") && !url.includes("/create");
    }, 60000);

    const projUi1 = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), uiP.variantId);
    if (Number(projUi1.onHand ?? projUi1.available ?? NaN) !== sysUi + 2) {
      throw new Error(`UI-positive adjustment did not add +2 to projection (${sysUi})`);
    }

    /** B — oversized source-batch confirm */
    const oP = await fx.ensureProduct(ctx.api, catId, `E2E-OVR-${suf}`, `E2E-OVV-${suf}`);
    const r1 = await fx.postReceipt(ctx.api, {
      productId: oP.productId,
      variantId: oP.variantId,
      qty: 14,
      unitCost: 1000,
      expiry: "2036-06-03",
      supplierName: `E2E-NCC-${suf}`,
    });
    await fx.postReceipt(ctx.api, {
      productId: oP.productId,
      variantId: oP.variantId,
      qty: 20,
      unitCost: 1100,
      expiry: "2036-06-04",
      supplierName: `E2E-NCC-${suf}`,
    });
    const bb = await fx.batchesForReceipt(ctx.api, r1.id);
    const bSmall = bb[0]?.id;
    if (!bSmall) throw new Error("missing small batch");

    const sysOver = fx.projectionQty(fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), oP.variantId));

    let draftOver;
    try {
      draftOver = await ctx.api.fetchJson("/api/stock-adjustments", {
        method: "POST",
        json: {
          reason: "OTHER",
          note: `oversized src ${suf}`,
          items: [{ variantId: oP.variantId, actualQty: Math.max(0, sysOver - 20), sourceBatchId: bSmall, note: "-" }],
        },
      });
    } catch (e) {
      throw new Error(`unexpected draft failure for oversized-source scenario: ${e?.message ?? e}`);
    }
    const jid = draftOver?.id;
    if (!jid) throw new Error("oversized draft missing id");

    const confRes = await ctx.api.fetch(`/api/stock-adjustments/${jid}/confirm`, { method: "PUT" });
    if (confRes.ok) {
      throw new Error("confirm with sourceBatch over remaining must fail HTTP");
    }

    /** C — positive batch partially sold → reverse reject */
    const pP = await fx.ensureProduct(ctx.api, catId, `E2E-PREV-${suf}`, `E2E-PREVV-${suf}`);
    await fx.postReceipt(ctx.api, {
      productId: pP.productId,
      variantId: pP.variantId,
      qty: 100,
      unitCost: 2000,
      expiry: "2036-08-09",
      supplierName: `E2E-NCC-${suf}`,
    });
    const projP0 = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), pP.variantId);
    const sysp = fx.projectionQty(projP0);
    const posDraft = await ctx.api.fetchJson("/api/stock-adjustments", {
      method: "POST",
      json: {
        reason: "OTHER",
        note: `pos ${suf}`,
        items: [{ variantId: pP.variantId, actualQty: sysp + 7, note: "+" }],
      },
    });
    const posId = posDraft.id;
    const adjNo = String(posDraft.adjNo ?? "");
    await ctx.api.fetchJson(`/api/stock-adjustments/${posId}/confirm`, { method: "PUT" });

    const allB = await ctx.api.fetchJson(`/api/batches/product/${pP.productId}`);
    const { variants: pVars } = await fx.fetchProductVariants(ctx.api, pP.productId);
    const pv = pVars.find((/** @type {any} */ v) => Number(v.id) === Number(pP.variantId));
    const varCodePiece = String(pv?.variantCode ?? pv?.code ?? `E2E-PREVV-${suf}`);
    const createdBat = Array.isArray(allB)
      ? allB.find((/** @type {any} */ b) => String(b.batchCode ?? "") === `${adjNo}-${varCodePiece}`)
      : null;
    if (!createdBat?.id) throw new Error(`positive adjustment batch ${adjNo}-${varCodePiece} missing`);

    await fx.createStaffInvoice(ctx.api, {
      customerName: "E2E cons",
      customerId: null,
      note: "consume created batch",
      promotionId: null,
      items: [
        {
          productId: pP.productId,
          quantity: 6,
          discountPercent: 0,
          variantId: pP.variantId,
          batchId: Number(createdBat.id),
        },
      ],
      quotePublicId: null,
      paymentMethod: "cash",
    });

    const revFail = await ctx.api.fetch(`/api/stock-adjustments/${posId}/reverse`, { method: "POST", json: {} });
    if (revFail.ok) throw new Error("reverse of positive adjustment after partial batch sale must fail");

    /** D — original exact-batch negative + UI reverse + duplicate reverse */
    const rP = await fx.ensureProduct(ctx.api, catId, `E2E-ADJ-${suf}`, `E2E-ADV-${suf}`);
    const rec = await fx.postReceipt(ctx.api, {
      productId: rP.productId,
      variantId: rP.variantId,
      qty: 14,
      unitCost: 4000,
      expiry: "2036-11-01",
      supplierName: `E2E-NCC-${suf}`,
    });
    const batches = await fx.batchesForReceipt(ctx.api, rec.id);
    const bid = batches[0]?.id;
    if (!bid) throw new Error("missing batch");

    const projBefore = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), rP.variantId);
    const sysHint = fx.projectionQty(projBefore);
    const batchBeforeRem = fx.batchRemaining(batches[0]);

    const draft = await ctx.api.fetchJson("/api/stock-adjustments", {
      method: "POST",
      json: {
        reason: "STOCKTAKE",
        note: `e2e ${suf}`,
        items: [{ variantId: rP.variantId, actualQty: Math.max(0, sysHint - 3), sourceBatchId: bid, note: "exact-batch" }],
      },
    });
    const adjId = draft.id;
    const adjNoLeg = String(draft.adjNo ?? "");
    if (!adjId || !adjNoLeg) throw new Error("adjustment draft missing id/adjNo");

    const projDraft = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), rP.variantId);
    if (fx.projectionQty(projDraft) !== sysHint) {
      throw new Error("DRAFT must not mutate projection");
    }

    await ctx.api.fetchJson(`/api/stock-adjustments/${adjId}/confirm`, { method: "PUT" });

    const batchesAfter = await fx.batchesForReceipt(ctx.api, rec.id);
    const remAfter = fx.batchRemaining(batchesAfter[0]);
    if (!(Number.isFinite(remAfter) && remAfter === batchBeforeRem - 3)) {
      throw new Error(`source batch remaining expected -3 (${batchBeforeRem}→${remAfter})`);
    }

    await driver.get(`${origin}/admin/stock-adjustments`);
    await waitForH1Containing(driver, "Kiểm kho", 25000);

    const filterInp = await driver.wait(
      until.elementLocated(By.css('input[placeholder*="Tìm mã phiếu"]')),
      15000,
    );
    await filterInp.clear();
    await filterInp.sendKeys(adjNoLeg);
    await driver.wait(
      until.elementLocated(By.xpath(`//button[contains(normalize-space(.), "${adjNoLeg}")]`)),
      35000,
    );
    await driver.findElement(By.xpath(`//button[contains(normalize-space(.), "${adjNoLeg}")]`)).click();

    await driver.wait(until.elementLocated(By.css('[data-testid="stock-adj-reverse-submit"]')), 15000);
    await driver.findElement(By.css('[data-testid="stock-adj-reverse-submit"]')).click();
    await driver.wait(
      async () => {
        const hdr = await ctx.api.fetchJson(`/api/stock-adjustments/${adjId}`);
        return Boolean(hdr.reversedAt || hdr.reversalAdjustmentId);
      },
      25000,
    );

    const dup = await ctx.api.fetch(`/api/stock-adjustments/${adjId}/reverse`, { method: "POST", json: {} });
    if (dup.ok) throw new Error("duplicate reverse must not succeed HTTP 2xx");

    ctx.api.setAccessToken(null);
  },
};
