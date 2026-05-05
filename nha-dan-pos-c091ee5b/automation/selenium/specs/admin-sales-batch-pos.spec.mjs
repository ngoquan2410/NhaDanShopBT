import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import { posScanInManualMode } from "../helpers/adminSales.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

/** Canonical BATCH:{id} POS path + invoice allocation + cancel restores batch remaining (cross-checked via API). */
export default {
  name: "Gate+: POS BATCH barcode exact batch sale + cancel restore",
  tags: ["admin", "admin-sales-suite", "watchlist-pos-invoice"],
  order: 20,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

    const loginBody = await ctx.api.authLoginJson(u, p);
    const token = typeof loginBody.accessToken === "string" ? loginBody.accessToken : String(loginBody.accessToken);
    ctx.api.setAccessToken(token);

    const suf = fx.uniq("bat");
    const catId = await fx.ensureCategory(ctx.api, `E2E-CAT-${suf}`);
    const { productId, variantId } = await fx.ensureProduct(ctx.api, catId, `E2E-BAT-${suf}`, `E2E-BV-${suf}`);

    const rec = await fx.postReceipt(ctx.api, {
      productId,
      variantId,
      qty: 9,
      unitCost: 4500,
      expiry: "2036-02-01",
      supplierName: `E2E-NCC-${suf}`,
    });
    const batches = await fx.batchesForReceipt(ctx.api, rec.id);
    const bid = batches[0]?.id;
    const rem0 = fx.batchRemaining(batches[0]);
    if (!bid || !Number.isFinite(rem0)) throw new Error("missing batch / remaining");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/pos`);

    await driver.wait(until.elementLocated(By.css('[aria-label="Ô nhập mã vạch"]')), 25000);
    await posScanInManualMode(driver, `BATCH:${bid}`);

    const checkoutXp = '//button[contains(normalize-space(.), "Tạo hóa đơn") and contains(normalize-space(.), "đ")]';
    const btn = await driver.wait(until.elementLocated(By.xpath(checkoutXp)), 45000);
    await driver.wait(async () => (await btn.isEnabled()), 45000);
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", btn);
    await driver.sleep(2500);
    await btn.click();

    await driver.wait(until.elementLocated(By.xpath("//h3[contains(., 'Tạo hóa đơn thành công')]")), 90000);

    const invPar = await driver.findElement(
      By.xpath(
        "//h3[contains(., 'Tạo hóa đơn thành công')]/following-sibling::p[contains(@class,'font-mono')]",
      ),
    );
    const invNo = (await invPar.getText()).trim();

    ctx.api.setAccessToken(token);
    const batchesAfter = await fx.batchesForReceipt(ctx.api, rec.id);
    const rem1 = fx.batchRemaining(batchesAfter[0]);
    if (rem1 !== rem0 - 1) {
      throw new Error(`exact batch remaining expected -1 (${rem0}→${rem1})`);
    }

    const invPage = await ctx.api.fetchJson(`/api/invoices?page=0&size=60&q=${encodeURIComponent(invNo)}`);
    const row = (invPage.content ?? []).find((r) => r.invoiceNo === invNo);
    if (!row?.id) throw new Error(`invoice ${invNo} not found`);

    const detail = await ctx.api.fetchJson(`/api/invoices/${row.id}`);
    const blob = JSON.stringify(detail);
    if (!blob.includes(String(bid))) {
      throw new Error("invoice JSON missing batch id trace for BATCH scan sale");
    }
    ctx.seed.registerCleanup(async () => {
      try {
        await ctx.api.fetch(`/api/invoices/${row.id}/cancel`, { method: "PATCH", json: {} });
      } catch {
        /* noop */
      }
    });

    await ctx.api.fetch(`/api/invoices/${row.id}/cancel`, { method: "PATCH", json: {} });

    const batchesRestored = await fx.batchesForReceipt(ctx.api, rec.id);
    const rem2 = fx.batchRemaining(batchesRestored[0]);
    if (rem2 !== rem0) {
      throw new Error(`cancel should restore batch remaining (${rem0} vs ${rem2})`);
    }

    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/invoices?q=${encodeURIComponent(invNo)}`);
    await waitForH1Containing(driver, "Hóa đơn", 20000);

    ctx.api.setAccessToken(null);
  },
};
