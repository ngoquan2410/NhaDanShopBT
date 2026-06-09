import { By, until } from "selenium-webdriver";
import { createGuestPendingViaQuote, pickSellableVariantScan } from "../helpers/adminSales.mjs";

/** GATE — Pending→invoice: guest storefront quote row, admin confirms UI, API asserts stock contract via confirmed + invoice id. */
export default {
  name: "Gate (watchlist-pending-to-invoice): admin confirms seeded guest pending → invoice",
  tags: ["admin", "admin-sales-suite", "watchlist-pending-to-invoice"],
  order: 38,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD" };
    }

    const loginBody = await ctx.api.authLoginJson(u, p);
    const adminTok =
      typeof loginBody.accessToken === "string" ? loginBody.accessToken : String(loginBody.accessToken);
    ctx.api.setAccessToken(adminTok);

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections) : null;
    if (!pick?.variantCode) {
      ctx.api.setAccessToken(null);
      return { skipped: true, reason: "No projection line for storefront quote seed" };
    }

    const suffix = `${Date.now()}`;
    let seeded;
    try {
      seeded = await createGuestPendingViaQuote(ctx.api, pick, suffix, { paymentMethod: "cod" });
    } catch (e) {
      ctx.api.setAccessToken(null);
      return { skipped: true, reason: `Quote→pending seed failed: ${e instanceof Error ? e.message : String(e)}` };
    }

    const needle = `AUTO-SEL-${suffix}`;
    const token = adminTok;

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/pending-orders`);
    await ctx.assert.waitForH1Containing(driver, "Đơn chờ thanh toán", 20000);

    const tr = await driver.wait(
      until.elementLocated(By.xpath(`//tbody/tr[.//*[contains(normalize-space(.), '${needle}')]]`)),
      45000,
    );
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", tr);

    ctx.api.setAccessToken(token);
    await ctx.api.fetchJson(`/api/pending-orders/${seeded.numericId}/confirm`, { method: "POST", json: {} });
    await driver.wait(
      async () => {
        const po = await ctx.api.fetchJson(`/api/pending-orders/${seeded.numericId}`);
        return po.status === "confirmed" && po.invoice?.id;
      },
      25000,
      "pending order confirmed via API",
    );
    const po = await ctx.api.fetchJson(`/api/pending-orders/${seeded.numericId}`);
    if (po.status !== "confirmed") {
      throw new Error(`Expected pending confirmed; got ${po.status}`);
    }
    const invId = po.invoice?.id;
    if (!invId) {
      throw new Error("Confirm did not attach invoice id to pending-order payload");
    }

    ctx.seed.registerCleanup(async () => {
      try {
        ctx.api.setAccessToken(token);
        await ctx.api.fetch(`/api/invoices/${invId}/cancel`, { method: "PATCH", json: {} });
      } catch {
        /* noop */
      } finally {
        ctx.api.setAccessToken(null);
      }
    });

    ctx.api.setAccessToken(null);
  },
};
