import { By, until } from "selenium-webdriver";
import { pickSellableVariantScan, posScanInManualMode } from "../helpers/adminSales.mjs";

function qtyFromProjections(rows, vid) {
  for (const raw of rows) {
    const p = typeof raw === "object" && raw !== null ? raw : {};
    if (Number(p.variantId) !== Number(vid)) continue;
    if (p.sellableQty === null || p.sellableQty === undefined) {
      return Number(p.available ?? p.onHand ?? 0);
    }
    return Number(p.sellableQty ?? p.available ?? p.onHand ?? 0);
  }
  return null;
}

export default {
  name:
    "Gate (watchlist-pos-invoice): POS scan + qty≥2 → quote/invoice/detail + projections delta",
  tags: ["admin", "admin-sales-suite", "watchlist-pos-invoice", "watchlist-invoice-lifecycle"],
  order: 16,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return {
        skipped: true,
        reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for admin-sales-suite",
      };
    }

    const loginBody = await ctx.api.authLoginJson(u, p);
    const token = typeof loginBody.accessToken === "string" ? loginBody.accessToken : String(loginBody.accessToken);
    ctx.api.setAccessToken(token);

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections, { minAvail: 2 }) : null;
    if (!pick?.variantCode) {
      ctx.api.setAccessToken(null);
      return { skipped: true, reason: "No sellable variant with stock found in projections" };
    }

    const stockBefore = qtyFromProjections(projections, pick.variantId);
    if (stockBefore === null || stockBefore < 2) {
      ctx.api.setAccessToken(null);
      return { skipped: true, reason: "Need ≥2 units on projection line for qty-stress assertion" };
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });

    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/pos`);

    await driver.wait(until.elementLocated(By.css('[aria-label="Ô nhập mã vạch"]')), 25000);

    await posScanInManualMode(driver, pick.variantCode);

    const qtyInputs = await driver.findElements(By.css("main .scrollbar-thin input[type='number']"));
    if (qtyInputs.length === 0) throw new Error("POS cart did not expose quantity input after scan");
    await driver.executeScript(
      `
      const el = arguments[0];
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '2');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: '2' }));
      `,
      qtyInputs[0],
    );
    await driver.sleep(300);

    // formatVND uses vi-VN currency (typically "₫") — do not require ASCII "đ".
    const checkoutXp = '//button[contains(normalize-space(.), "Tạo hóa đơn")]';
    const btn = await driver.wait(until.elementLocated(By.xpath(checkoutXp)), 45000);
    await driver.wait(async () => (await btn.isEnabled()), 45000);
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", btn);
    await driver.sleep(3500);
    await btn.click();

    await driver.wait(until.elementLocated(By.xpath("//h3[contains(., 'Tạo hóa đơn thành công')]")), 90000);

    const invPar = await driver.findElement(
      By.xpath(
        "//h3[contains(., 'Tạo hóa đơn thành công')]/following-sibling::p[contains(@class,'font-mono')]",
      ),
    );
    const invNo = (await invPar.getText()).trim();

    ctx.api.setAccessToken(token);
    const projectionsAfter = await ctx.api.fetchJson("/api/inventory/projections");
    const stockAfter = qtyFromProjections(projectionsAfter, pick.variantId);
    if (stockAfter === null || stockBefore === null || stockBefore - stockAfter !== 2) {
      throw new Error(
        `Projections qty delta expected -2 (${stockBefore}→${stockAfter}) for qty=2 POS invoice`,
      );
    }

    const invPage = await ctx.api.fetchJson(`/api/invoices?page=0&size=60&q=${encodeURIComponent(invNo)}`);
    const row = (invPage.content ?? []).find((r) => r.invoiceNo === invNo);
    if (!row?.id) {
      throw new Error(`Invoice ${invNo} not found via GET /api/invoices?q=`);
    }

    const detail = await ctx.api.fetchJson(`/api/invoices/${row.id}`);
    const tot = Number(detail?.finalAmount ?? detail?.totalAmount ?? NaN);
    if (!Number.isFinite(tot)) {
      throw new Error("Invoice detail missing numeric totals (finalAmount/totalAmount)");
    }

    ctx.seed.registerCleanup(async () => {
      try {
        await ctx.api.fetch(`/api/invoices/${row.id}/cancel`, { method: "PATCH", json: {} });
      } catch {
        /* already cancelled or locked */
      }
    });

    await driver.navigate().to(
      `${ctx.config.baseUrl.replace(/\/$/, "")}/admin/invoices?q=${encodeURIComponent(invNo)}`,
    );
    await ctx.assert.waitForH1Containing(driver, "Hóa đơn", 20000);
    await driver.wait(
      until.elementLocated(By.xpath(`//button[normalize-space(.)="${invNo}"]`)),
      12000,
    );

    ctx.api.setAccessToken(null);
  },
};
