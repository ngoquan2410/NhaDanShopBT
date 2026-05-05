import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

/**
 * Goods receipt: UI create/list/detail, BATCH:{id}, void, duplicate void idempotency,
 * delete-block banner when batches consumed, projection + variant stock parity.
 */
export default {
  name: "Gate+: goods receipt UI create/list/detail + BATCH:void + delete-block + projections",
  tags: ["admin", "p5-inventory", "watchlist-receipts-adjustments", "watchlist-inventory-truth"],
  order: 58,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

    await fx.loginAdminApi(ctx.api, u, p);
    const suf = fx.uniq("rcp");
    const catId = await fx.ensureCategory(ctx.api, `E2E-CAT-${suf}`);
    const prodCode = `E2E-RCP-${suf}`;
    const varCode = `E2E-RV-${suf}`;
    const { productId, variantId } = await fx.ensureProduct(ctx.api, catId, prodCode, varCode);

    const sup = await fx.ensureSupplier(ctx.api, `E2E-NCC-${suf}`);

    /** Parallel path: consumed receipt → drawer shows delete-hard-block banner. */
    const rSold = await fx.postReceipt(ctx.api, {
      productId,
      variantId,
      qty: 22,
      unitCost: 2000,
      expiry: "2036-03-05",
      supplierName: sup.name,
    });
    const soldBid = (await fx.batchesForReceipt(ctx.api, rSold.id))[0]?.id;
    if (!soldBid) throw new Error("sold scenario missing batch");

    await fx.sellVariantOneFefo(ctx.api, productId, variantId);

    const projBeforeUi = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), variantId);
    const qBeforeUi = fx.projectionQty(projBeforeUi, "onHand");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    /** --- UI create receipt --- */
    await driver.get(`${origin}/admin/goods-receipts/create`);
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(normalize-space(.),'Tạo phiếu nhập')]`)), 25000);

    const supTrigger = await driver.wait(
      until.elementLocated(
        By.xpath(`//label[contains(normalize-space(.),'Nhà cung cấp')]/following-sibling::*[1]//button[@type='button']`),
      ),
      15000,
    );
    await supTrigger.click();
    const combSearch = await driver.wait(
      until.elementLocated(By.xpath(`//input[@placeholder='Tìm theo tên, SĐT, mã...']`)),
      8000,
    );
    await combSearch.clear();
    await combSearch.sendKeys(sup.name);
    const supOpt = await driver.wait(
      until.elementLocated(
        By.xpath(`//div[contains(@class,'popover')]//button[contains(normalize-space(.), '${sup.name}')]`),
      ),
      12000,
    );
    await supOpt.click();

    const manualInp = await driver.wait(
      until.elementLocated(By.xpath(`//input[contains(@placeholder,'Thêm dòng tay')]`)),
      15000,
    );
    await manualInp.clear();
    await manualInp.sendKeys(prodCode);
    await driver.wait(
      until.elementLocated(By.xpath(`//ul[@role='listbox']//button[@role='option']`)),
      12000,
    );
    await driver.findElement(By.xpath(`//ul[@role='listbox']//button[@role='option'][1]`)).click();

    const qtyCell = await driver.wait(until.elementLocated(By.xpath(`//table//tbody//tr[1]//td[5]//input`)), 12000);
    await driver.executeScript(
      `
      const el = arguments[0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '5');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      `,
      qtyCell,
    );

    await driver.wait(until.elementLocated(By.xpath(`//tbody//tr[1]//*[contains(@class,'bg-success-soft')]`)), 12000).catch(async () => {
      await driver.findElement(By.xpath(`//button[contains(.,'Revalidate')]`)).click();
    });

    await driver.findElement(By.css('[data-testid="goods-receipt-save-submit"]')).click();

    await driver.wait(until.elementLocated(By.xpath(`//*[contains(.,'Đã lưu phiếu nhập')]`)), 45000);
    await driver.wait(until.elementLocated(By.xpath(`//button[contains(.,'In mã vạch')]`) ), 45000);

    const strong = await driver.findElement(By.xpath(`//*[contains(.,'Đã lưu phiếu nhập')]//strong`));
    const receiptNoUi = String(await strong.getText()).trim();
    if (!receiptNoUi) throw new Error("missing receiptNo from UI after save");

    const pageRc = await ctx.api.fetchJson("/api/receipts?page=0&size=30");
    const hit = (pageRc.content ?? []).find((/** @type {any} */ r) => String(r.receiptNo) === receiptNoUi);
    if (!hit?.id) throw new Error(`receipt ${receiptNoUi} not found via GET /api/receipts`);
    const rid = Number(hit.id);

    const proj1 = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), variantId);
    fx.assertProjectionPhysicalMatchesBatches(proj1);
    const qAfterUi = fx.projectionQty(proj1, "onHand");
    const { variants } = await fx.fetchProductVariants(ctx.api, productId);
    const vrow = variants.find((/** @type {any} */ vv) => Number(vv.id) === variantId);
    const stockQty = Number(vrow?.stockQty ?? vrow?.stock ?? NaN);
    if (!(Number.isFinite(qAfterUi) && qAfterUi === qBeforeUi + 5 && stockQty === qAfterUi)) {
      throw new Error(`variant.stockQty/onHand parity failed (${qBeforeUi}→${qAfterUi}, stockQty=${stockQty})`);
    }

    const batches = await fx.batchesForReceipt(ctx.api, rid);
    const bid = batches[0]?.id;
    const remIncoming = fx.batchRemaining(batches[0]);
    if (!bid || remIncoming !== 5) throw new Error(`incoming batch parity (rem=${remIncoming})`);

    await driver.get(`${origin}/admin/goods-receipts`);
    await waitForH1Containing(driver, "Phiếu nhập", 25000);

    const rowOpen = await driver.wait(
      until.elementLocated(By.xpath(`//button[contains(normalize-space(.),"${receiptNoUi}")]`)),
      25000,
    );
    await rowOpen.click();

    await driver.wait(until.elementLocated(By.css('[data-testid="goods-receipt-detail-number"]')), 20000);
    await driver.findElement(By.css('[data-testid="goods-receipt-barcode-open"]')).click();
    await driver.wait(until.elementLocated(By.xpath(`//*[contains(text(),'BATCH:${bid}')]`)), 15000);
    const closeBtns = await driver.findElements(By.xpath("//button[normalize-space(.)='Đóng']"));
    if (closeBtns.length) await closeBtns[closeBtns.length - 1].click();

    await driver.findElement(By.css('[data-testid="goods-receipt-void-open"]')).click();
    await driver.wait(until.elementLocated(By.xpath("//h3[contains(.,'Hủy (void) phiếu nhập')]")), 10000);
    const confirmVoid = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(normalize-space(.),'Xác nhận void')]")),
      10000,
    );
    await confirmVoid.click();
    await driver.wait(
      async () => {
        const be = await ctx.api.fetchJson(`/api/receipts/${rid}`);
        return String(be.status) === "voided";
      },
      20000,
    );

    const voidDup = await ctx.api.fetch(`/api/receipts/${rid}/void`, {
      method: "PATCH",
      json: { reason: "e2e idempotent replay" },
    });
    // Matches CriticalWatchlistGateMvcIntegrationTest: replay without Idempotency-Key → 409 CONFLICT ("đã void").
    if (!(voidDup.ok || voidDup.status === 409)) {
      throw new Error(`duplicate void expected 2xx or 409, got ${voidDup.status}`);
    }

    const delVoided = await ctx.api.fetch(`/api/receipts/${rid}`, { method: "DELETE" });
    if (delVoided.ok || delVoided.status < 400) {
      throw new Error("DELETE voided receipt must fail");
    }

    const soldRc = await ctx.api.fetchJson(`/api/receipts/${rSold.id}`);
    const soldNo = String(soldRc.receiptNo ?? "");
    if (!soldNo) throw new Error("sold receipt missing number");

    const rowSold = await driver.wait(
      until.elementLocated(By.xpath(`//button[contains(normalize-space(.),"${soldNo}")]`)),
      35000,
    );
    await rowSold.click();

    await driver.wait(
      until.elementLocated(By.xpath(`//*[contains(normalize-space(.),'Không thể xóa phiếu')]`)),
      20000,
    );

    ctx.api.setAccessToken(null);
  },
};
