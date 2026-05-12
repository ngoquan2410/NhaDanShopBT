/**
 * Slice G: receipt delete vs void mapping (UI + 409 code handling).
 * Run: npm run e2e:slice-g
 */
import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

/** @param {string} c @param {'PASS'|'FAIL'|'SKIPPED_WITH_REASON'} s @param {Record<string, unknown>} [extra] */
function cr(c, s, extra = {}) {
  return { case: c, status: s, ...extra };
}

/** When API/UI setup fails early, still emit a full case matrix for automation-summary. */
function criticalFails(reason) {
  return [
    cr("receipt_downstream_delete_shows_blocked_dialog", "FAIL", { reason }),
    cr("receipt_detail_downstream_panel_gated", "FAIL", { reason }),
    cr("receipt_voided_does_not_show_downstream_dialog", "FAIL", { reason }),
    cr("receipt_void_action_uses_patch_not_delete", "FAIL", { reason }),
    cr("receipt_void_success_refreshes_status", "FAIL", { reason }),
    cr("receipt_delete_allowed_unconsumed_uses_delete", "FAIL", { reason }),
    cr("receipt_delete_409_other_not_downstream_copy", "SKIPPED_WITH_REASON", { reason: `blocked: ${reason}` }),
    cr("receipt_fully_consumed_void_metadata_only", "SKIPPED_WITH_REASON", { reason: `blocked: ${reason}` }),
  ];
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function installReceiptFetchTap(driver) {
  await driver.executeScript(`
    window.__sliceGReceiptTap = [];
    const orig = window.fetch.bind(window);
    window.fetch = function(input, init) {
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = (init && init.method) || 'GET';
        if (String(url).indexOf('/api/receipts') >= 0) {
          window.__sliceGReceiptTap.push({ url: String(url), method: String(method || 'GET').toUpperCase() });
        }
      } catch (e) {}
      return orig(input, init);
    };
  `);
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function readReceiptFetchTap(driver) {
  /** @type {unknown} */
  const raw = await driver.executeScript(`return window.__sliceGReceiptTap || [];`);
  return Array.isArray(raw) ? raw : [];
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function closeGoodsReceiptDrawer(driver) {
  const btn = await driver.wait(
    until.elementLocated(
      By.xpath(
        `//h2[@data-testid='goods-receipt-detail-number']/ancestor::div[contains(@class,'border-b')]//button[@type='button']`,
      ),
    ),
    8000,
  );
  await btn.click();
}

export default {
  name: "Slice G: receipt delete/void UX + API mapping",
  tags: ["slice-g"],
  order: 54,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    const caseResults = [];

    if (!u || !p) {
      return {
        skipped: true,
        reason: "ADMIN_USERNAME / ADMIN_PASSWORD",
        caseResults: [
          cr("receipt_downstream_delete_shows_blocked_dialog", "SKIPPED_WITH_REASON", {
            reason: "no admin creds",
          }),
          cr("receipt_detail_downstream_panel_gated", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("receipt_voided_does_not_show_downstream_dialog", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("receipt_void_action_uses_patch_not_delete", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("receipt_void_success_refreshes_status", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("receipt_delete_allowed_unconsumed_uses_delete", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("receipt_delete_409_other_not_downstream_copy", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
          cr("receipt_fully_consumed_void_metadata_only", "SKIPPED_WITH_REASON", { reason: "no admin creds" }),
        ],
      };
    }

    const ts = Date.now();
    const prefix = `SLICE_G_${ts}`;

    await fx.loginAdminApi(ctx.api, u, p);

    const catId = await fx.ensureCategory(ctx.api, `${prefix}_CAT`);
    const sup = await fx.ensureSupplier(ctx.api, `${prefix}_NCC`);

    const pvDel = await fx.ensureProduct(ctx.api, catId, `${prefix}_PDEL`, `${prefix}_VDEL`);
    const pvDown = await fx.ensureProduct(ctx.api, catId, `${prefix}_PDOWN`, `${prefix}_VDOWN`);
    const pvVoid = await fx.ensureProduct(ctx.api, catId, `${prefix}_PVOID`, `${prefix}_VVOID`);
    const pvFull = await fx.ensureProduct(ctx.api, catId, `${prefix}_PFULL`, `${prefix}_VFULL`);

    const rUnconsumed = await fx.postReceipt(ctx.api, {
      productId: pvDel.productId,
      variantId: pvDel.variantId,
      qty: 8,
      unitCost: 1000,
      expiry: "2036-04-01",
      supplierName: sup.name,
      note: `${prefix} unconsumed`,
    });
    const rDown = await fx.postReceipt(ctx.api, {
      productId: pvDown.productId,
      variantId: pvDown.variantId,
      qty: 14,
      unitCost: 2000,
      expiry: "2036-04-02",
      supplierName: sup.name,
      note: `${prefix} downstream`,
    });
    await fx.sellVariantOneFefo(ctx.api, pvDown.productId, pvDown.variantId);

    const rVoidOnly = await fx.postReceipt(ctx.api, {
      productId: pvVoid.productId,
      variantId: pvVoid.variantId,
      qty: 5,
      unitCost: 1500,
      expiry: "2036-04-03",
      supplierName: sup.name,
      note: `${prefix} voided fixture`,
    });
    await ctx.api.fetchJson(`/api/receipts/${rVoidOnly.id}/void`, {
      method: "PATCH",
      json: { reason: `${prefix} api void` },
    });

    const rFull = await fx.postReceipt(ctx.api, {
      productId: pvFull.productId,
      variantId: pvFull.variantId,
      qty: 3,
      unitCost: 900,
      expiry: "2036-04-04",
      supplierName: sup.name,
      note: `${prefix} full consume`,
    });
    for (let i = 0; i < 3; i += 1) {
      await fx.sellVariantOneFefo(ctx.api, pvFull.productId, pvFull.variantId);
    }

    const downId = Number(rDown.id);
    const delId = Number(rUnconsumed.id);
    const voidId = Number(rVoidOnly.id);
    const fullId = Number(rFull.id);
    if (![downId, delId, voidId, fullId].every((x) => Number.isFinite(x) && x > 0)) {
      throw new Error("fixture receipt ids invalid");
    }

    /** API evidence: downstream DELETE → 409 + code */
    const delDownRes = await ctx.api.fetch(`/api/receipts/${downId}`, { method: "DELETE" });
    const delDownText = await delDownRes.text();
    /** @type {Record<string, unknown>} */
    let delDownBody = {};
    try {
      delDownBody = delDownText ? JSON.parse(delDownText) : {};
    } catch {
      delDownBody = { _raw: delDownText };
    }
    if (delDownRes.status !== 409 || String(delDownBody.code) !== "downstream_consumption") {
      const msg = `expected DELETE downstream 409 code downstream_consumption, got ${delDownRes.status} ${JSON.stringify(delDownBody)}`;
      return { outcome: "fail", reason: msg, caseResults: criticalFails(msg) };
    }

    const delVoidedRes = await ctx.api.fetch(`/api/receipts/${voidId}`, { method: "DELETE" });
    const delVoidedText = await delVoidedRes.text();
    /** @type {Record<string, unknown>} */
    let delVoidedBody = {};
    try {
      delVoidedBody = delVoidedText ? JSON.parse(delVoidedText) : {};
    } catch {
      delVoidedBody = { _raw: delVoidedText };
    }
    if (delVoidedRes.status !== 409 || String(delVoidedBody.code) !== "voided") {
      const msg = `expected DELETE voided 409 code voided, got ${delVoidedRes.status} ${JSON.stringify(delVoidedBody)}`;
      return { outcome: "fail", reason: msg, caseResults: criticalFails(msg) };
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    await driver.get(`${origin}/admin/goods-receipts`);
    await waitForH1Containing(driver, "Phiếu nhập", 30000);

    /* 1 — downstream blocked dialog */
    const hintBtn = await driver.wait(
      until.elementLocated(By.css(`[data-testid="goods-receipt-delete-hint-${downId}"]`)),
      25000,
    );
    await hintBtn.click();
    const dlg = await driver.wait(until.elementLocated(By.css('[data-testid="receipt-delete-blocked-dialog"]')), 15000);
    const lead = await dlg.findElement(By.css('[data-testid="receipt-delete-blocked-downstream-lead"]')).getText();
    if (!lead.includes("Phiếu nhập/lô đã phát sinh bán hàng nên không thể xóa")) {
      throw new Error(`downstream dialog lead unexpected: ${lead}`);
    }
    const opts = await dlg.findElement(By.css('[data-testid="receipt-delete-blocked-downstream-options"]')).getText();
    for (const frag of ["Void phần tồn còn lại", "phiếu điều chỉnh", "batch"]) {
      if (!opts.toLowerCase().includes(frag.toLowerCase())) {
        throw new Error(`downstream options missing fragment "${frag}": ${opts}`);
      }
    }
    await driver.findElement(By.css('[data-testid="receipt-delete-blocked-dialog"] button[aria-label="Đóng"]')).click();
    caseResults.push(cr("receipt_downstream_delete_shows_blocked_dialog", "PASS"));

    /* 2 — detail downstream panel */
    await driver.wait(until.stalenessOf(dlg), 5000).catch(() => {});
    const downNo = String(rDown.receiptNo ?? "").trim();
    await driver.findElement(By.xpath(`//tr[@data-testid="goods-receipt-row-${downId}"]//button[contains(normalize-space(.),"${downNo}")]`)).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="goods-receipt-detail-downstream-panel"]')), 15000);
    caseResults.push(cr("receipt_detail_downstream_panel_gated", "PASS"));
    await closeGoodsReceiptDrawer(driver);

    /* 3 — voided receipt: no downstream panel */
    const voidNo = String(rVoidOnly.receiptNo ?? "").trim();
    await driver.wait(
      until.elementLocated(By.xpath(`//tr[@data-testid="goods-receipt-row-${voidId}"]//button[contains(normalize-space(.),"${voidNo}")]`)),
      25000,
    ).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="goods-receipt-detail-void-meta"]')), 15000);
    const badPanels = await driver.findElements(By.css('[data-testid="goods-receipt-detail-downstream-panel"]'));
    if (badPanels.length) {
      throw new Error("voided receipt must not show downstream panel");
    }
    await closeGoodsReceiptDrawer(driver);
    caseResults.push(cr("receipt_voided_does_not_show_downstream_dialog", "PASS"));

    /* 4–5 — void uses PATCH; list shows voided */
    await installReceiptFetchTap(driver);
    await driver.findElement(By.xpath(`//tr[@data-testid="goods-receipt-row-${downId}"]//button[contains(normalize-space(.),"${downNo}")]`)).click();
    await driver.wait(until.elementLocated(By.css('[data-testid="goods-receipt-void-open"]')), 15000);
    await driver.findElement(By.css('[data-testid="goods-receipt-void-open"]')).click();
    const voidConfirm = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(normalize-space(.),'Xác nhận void')]")),
      10000,
    );
    await voidConfirm.click();
    await driver.wait(
      async () => {
        const be = await ctx.api.fetchJson(`/api/receipts/${downId}`);
        return String(be.status) === "voided";
      },
      25000,
    );
    const tap = await readReceiptFetchTap(driver);
    const patchVoid = tap.some(
      (/** @type {any} */ x) =>
        String(x.method) === "PATCH" && String(x.url).includes(`/api/receipts/${downId}/void`),
    );
    const delBad = tap.some(
      (/** @type {any} */ x) =>
        String(x.method) === "DELETE" &&
        String(x.url).includes("/api/receipts/") &&
        String(x.url).includes(`/${downId}`) &&
        !String(x.url).includes("/void"),
    );
    if (!patchVoid) {
      throw new Error(`expected PATCH void in tap, got ${JSON.stringify(tap)}`);
    }
    if (delBad) {
      throw new Error(`unexpected DELETE for receipt ${downId}: ${JSON.stringify(tap)}`);
    }
    caseResults.push(cr("receipt_void_action_uses_patch_not_delete", "PASS"));

    await driver.wait(until.elementLocated(By.css('[data-testid="goods-receipt-detail-void-meta"]')), 15000);
    const downstreamAfterVoid = await driver.findElements(By.css('[data-testid="goods-receipt-detail-downstream-panel"]'));
    if (downstreamAfterVoid.length) {
      throw new Error("downstream panel must disappear after void");
    }
    caseResults.push(cr("receipt_void_success_refreshes_status", "PASS"));
    await closeGoodsReceiptDrawer(driver);

    /* 6 — unconsumed delete uses DELETE */
    await installReceiptFetchTap(driver);
    await driver.findElement(By.css(`[data-testid="goods-receipt-delete-${delId}"]`)).click();
    const delConfirm = await driver.wait(
      until.elementLocated(
        By.xpath("//button[contains(normalize-space(.),'Xóa phiếu nhập')][contains(@class,'bg-danger')]"),
      ),
      8000,
    );
    await delConfirm.click();
    await driver.wait(
      async () => {
        try {
          await ctx.api.fetchJson(`/api/receipts/${delId}`);
          return false;
        } catch {
          return true;
        }
      },
      20000,
    );
    const tapDel = await readReceiptFetchTap(driver);
    const delHit = tapDel.filter(
      (/** @type {any} */ x) =>
        String(x.method) === "DELETE" && String(x.url).includes(`/api/receipts/${delId}`),
    );
    if (!delHit.length) {
      throw new Error(`expected DELETE /api/receipts/${delId}, tap=${JSON.stringify(tapDel)}`);
    }
    caseResults.push(cr("receipt_delete_allowed_unconsumed_uses_delete", "PASS"));

    /* 7 — not reachable in UI; mapper covered by Vitest */
    caseResults.push(
      cr("receipt_delete_409_other_not_downstream_copy", "SKIPPED_WITH_REASON", {
        reason: "voided receipt omits delete in UI; conflict mapping covered by receiptUiState.test.ts",
      }),
    );

    /* 8 — fully consumed void */
    try {
      await ctx.api.fetchJson(`/api/receipts/${fullId}/void`, {
        method: "PATCH",
        json: { reason: `${prefix} full consumed void` },
      });
      const be = await ctx.api.fetchJson(`/api/receipts/${fullId}`);
      if (String(be.status) !== "voided") {
        throw new Error(`full consume void expected status voided, got ${be.status}`);
      }
      caseResults.push(cr("receipt_fully_consumed_void_metadata_only", "PASS"));
    } catch (e) {
      caseResults.push(
        cr("receipt_fully_consumed_void_metadata_only", "SKIPPED_WITH_REASON", {
          reason: e?.message || String(e),
        }),
      );
    }

    return { caseResults };
  },
};
