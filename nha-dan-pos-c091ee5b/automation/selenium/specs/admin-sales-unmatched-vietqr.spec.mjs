import { By, until } from "selenium-webdriver";

import { pickSellableVariantScan, posScanInManualMode } from "../helpers/adminSales.mjs";

export default {
  name: "Phase 4: Unmatched Casso UI + POS VietQR path (sandbox or configurability message)",
  tags: ["admin", "admin-sales-suite"],
  order: 19,
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
    ctx.api.setAccessToken(typeof loginBody.accessToken === "string" ? loginBody.accessToken : String(loginBody.accessToken));

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });

    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/unmatched-payments`);

    await driver.wait(until.elementLocated(By.xpath("//h1[contains(., 'Đối soát giao dịch')]")), 22000);

    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/pos`);

    await driver.wait(until.elementLocated(By.css('[aria-label="Ô nhập mã vạch"]')), 22000);

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections) : null;

    ctx.api.setAccessToken(null);

    if (!pick?.variantCode) {
      throw new Error("fixtures-bootstrap should leave a sellable projection — none found for scan");
    }
    await posScanInManualMode(driver, pick.variantCode);

    const transferXp = '//button[contains(normalize-space(.),"Chuyển khoản")]';
    const transferBtn = await driver.wait(until.elementLocated(By.xpath(transferXp)), 28000);
    await driver.wait(until.elementIsVisible(transferBtn), 8000);
    await transferBtn.click();
    await driver.sleep(400);

    const qrBtnXp = '//button[contains(normalize-space(.),"Mở QR cho khách quét")]';
    const qrBtn = await driver.wait(until.elementLocated(By.xpath(qrBtnXp)), 45000);
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", qrBtn);
    await driver.wait(until.elementIsVisible(qrBtn), 8000);
    await qrBtn.click();

    await driver.sleep(800);

    const okDialog = await driver.findElements(By.xpath("//*[contains(., 'QR thanh toán')]"));
    const errBox = await driver.findElements(
      By.xpath("//*[contains(., 'VietQR') or contains(., 'vietqr') or contains(., 'tài khoản ngân hàng')]"),
    );

    if (okDialog.length === 0 && errBox.length === 0) {
      throw new Error("VietQR dialog did not render a title nor a VietQR error — unexpected UI state");
    }
  },
};
