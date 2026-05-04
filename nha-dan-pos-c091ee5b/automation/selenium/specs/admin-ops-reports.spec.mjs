import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/**
 * Phase 5+ revenue/profit reports + dashboard zero-trend sanity
 * (trend hidden when prior-period baseline is 0 — see Dashboard.tsx pctTrendVersusPrev).
 */
export default {
  name: "Phase 5+: revenue/profit reports + dashboard consistency smoke",
  tags: ["admin", "p5-reports", "watchlist-revenue-profit"],
  order: 56,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for p5-reports" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const from = `${y}-${m}-01`;
    const to = `${y}-${m}-${d}`;

    await ctx.api.fetchJson(`/api/revenue/total?from=${from}&to=${to}&period=daily`);
    await ctx.api.fetchJson(`/api/reports/profit?from=${from}&to=${to}`);

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/revenue`);
    await waitForH1Containing(driver, "Doanh thu", 25000);

    await driver.get(`${origin}/admin/profit`);
    await waitForH1Containing(driver, "Lợi nhuận", 25000);

    await driver.get(`${origin}/admin`);
    await waitForH1Containing(driver, "Dashboard", 25000);
    const bogusTrends = await driver.findElements(
      By.xpath("//span[contains(normalize-space(.), '+12%') or contains(normalize-space(.), '+8%')]"),
    );
    if (bogusTrends.length > 0) {
      throw new Error("Dashboard showed hardcoded-style trend badges; check StatCard / trend wiring vs API zero-state");
    }

    await driver.wait(until.elementLocated(By.xpath("//h3[contains(., 'Sắp hết hàng')]")), 20000);

    ctx.api.setAccessToken(null);
  },
};
