import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/**
 * Phase 5+ store/shipping/GHN logs/Goong test — third-party paths may 500 without keys;
 * UI must still render for diagnostics pages.
 */
export default {
  name: "Phase 5+: store & shipping settings + GHN logs + Goong test page",
  tags: ["admin", "p5-settings"],
  order: 54,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for p5-settings" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    await ctx.api.fetchJson("/api/store/payment-settings");
    const shipRes = await ctx.api.fetch("/api/shipping/quote", {
      method: "POST",
      json: {
        address: {
          provinceCode: "01",
          provinceName: "HN",
          districtCode: "1",
          districtName: "Q",
          wardCode: "1",
          wardName: "P",
        },
        subtotal: 50000,
        weightGrams: 500,
      },
    });
    if (!shipRes.ok) throw new Error(`shipping quote fallback expected 200, got ${shipRes.status}`);

    await ctx.api.fetchJson("/api/admin/ghn-quote-logs?page=0&size=5");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/store-settings`);
    await waitForH1Containing(driver, "Cài đặt cửa hàng", 25000);

    await driver.get(`${origin}/admin/shipping-settings`);
    await waitForH1Containing(driver, "Cài đặt giao hàng", 25000);

    await driver.get(`${origin}/admin/ghn-quote-logs`);
    await waitForH1Containing(driver, "Nhật ký báo giá GHN", 25000);

    await driver.get(`${origin}/admin/goong-test`);
    await waitForH1Containing(driver, "Goong API", 25000);

    await driver.get(`${origin}/admin`);
    await waitForH1Containing(driver, "Dashboard", 25000);
    await driver.executeScript(`
      window.dispatchEvent(new CustomEvent('nhadan:session-expired', { detail: { nextPath: '/admin/store-settings' } }));
    `);
    await driver.wait(until.elementLocated(By.css('[data-testid="session-expired-modal"]')), 12000);
    await driver.findElement(By.css('[data-testid="session-expired-login"]')).click();
    await driver.wait(async () => (await driver.getCurrentUrl()).includes("/login"), 15000);

    ctx.api.setAccessToken(null);
  },
};
