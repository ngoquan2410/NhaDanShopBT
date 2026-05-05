import { By, until } from "selenium-webdriver";
import { waitForH1Containing, assertXlsxMagicFromGet } from "../helpers/assertions.mjs";

/** Authenticated Excel endpoints return ZIP/xlsx + inventory UI export control visible. */
export default {
  name: "Gate+: inventory/revenue/profit Excel exports + inventory UI export control",
  tags: ["admin", "p5-reports", "watchlist-revenue-profit", "watchlist-inventory-truth"],
  order: 62,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

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

    await assertXlsxMagicFromGet(ctx.api, `/api/reports/inventory/export?from=${from}&to=${to}`);
    await assertXlsxMagicFromGet(ctx.api, `/api/revenue/total/export?from=${from}&to=${to}&period=daily`);
    await assertXlsxMagicFromGet(ctx.api, `/api/reports/profit/export?from=${from}&to=${to}`);

    const invThis = await ctx.api.fetchJson(`/api/reports/inventory/this-month`);
    if (!invThis || typeof invThis !== "object" || !Array.isArray(invThis.rows)) {
      throw new Error("GET /api/reports/inventory/this-month must expose rows[]");
    }
    if (invThis.rows.length === 0) {
      console.warn("[reports-export] inventory snapshot empty — skip closingStock probes");
    } else {
      for (const row of invThis.rows.slice(0, 80)) {
        const r = typeof row === "object" && row !== null ? /** @type {Record<string, unknown>} */ (row) : {};
        if (r.variantId == null && r.productId == null) continue;
        const cq = Number(r.closingStock ?? NaN);
        if (!Number.isFinite(cq) || cq < 0) throw new Error("inventory row missing closingStock");
        break;
      }
    }

    const revTotals = await ctx.api.fetchJson(`/api/revenue/total?from=${from}&to=${to}&period=daily`);
    if (!revTotals || typeof revTotals !== "object") throw new Error("/api/revenue/total missing body");
    if (!Array.isArray(revTotals.rows)) throw new Error("/api/revenue/total must include rows[]");
    const totAmt = Number(revTotals.totalAmount ?? NaN);
    if (!Number.isFinite(totAmt) || totAmt < 0) throw new Error("/api/revenue/total totalAmount invalid");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/inventory-report`);
    await waitForH1Containing(driver, "Báo cáo tồn kho", 25000);
    await driver.wait(until.elementLocated(By.css('[data-testid="inventory-report-export-excel"]')), 12000);

    await driver.get(`${origin}/admin/revenue`);
    await waitForH1Containing(driver, "Doanh thu", 25000);

    await driver.get(`${origin}/admin/profit`);
    await waitForH1Containing(driver, "Lợi nhuận", 25000);

    ctx.api.setAccessToken(null);
  },
};
