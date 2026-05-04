import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/** Phase 5b — Inventory receipts, adjustments, report + projections API. */
export default {
  name: "Phase 5b: inventory pages load + projections API contract",
  tags: ["admin", "p5-inventory"],
  order: 51,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for p5-inventory" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    if (!Array.isArray(projections)) throw new Error("projections must be an array");

    await ctx.api.fetchJson("/api/receipts?page=0&size=5");
    await ctx.api.fetchJson("/api/stock-adjustments?page=0&size=5");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    for (const [path, title] of [
      ["/admin/goods-receipts", "Phiếu nhập"],
      ["/admin/stock-adjustments", "Kiểm kho / Điều chỉnh"],
      ["/admin/inventory-report", "Báo cáo tồn kho"],
    ]) {
      await driver.get(`${origin}${path}`);
      await waitForH1Containing(driver, title, 25000);
    }

    await driver.get(`${origin}/admin/stock-adjustments/create`);
    await waitForH1Containing(driver, "Phiếu điều chỉnh", 25000);
    const searchEl = await driver.wait(
      until.elementLocated(By.css('[data-testid="stock-adj-product-search"]')),
      15000,
    );
    await searchEl.clear();
    await searchEl.sendKeys("E2E");
    await driver.wait(
      async () =>
        (await driver.findElements(By.css('[data-testid="stock-adj-search-suggestions"] li'))).length > 0,
      20000,
    );

    ctx.api.setAccessToken(null);
  },
};
