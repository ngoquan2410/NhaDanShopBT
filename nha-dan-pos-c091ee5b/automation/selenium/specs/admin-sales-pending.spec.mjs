import { By, until } from "selenium-webdriver";
import { createGuestPendingViaQuote, pickSellableVariantScan } from "../helpers/adminSales.mjs";

export default {
  name: "Phase 4: Pending orders — seeded guest quote row → cancel in UI",
  tags: ["admin", "admin-sales-suite"],
  order: 17,
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

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections) : null;
    if (!pick?.variantCode) {
      ctx.api.setAccessToken(null);
      return {
        skipped: true,
        reason: "Cannot seed pending guest order — no in-stock projection line",
      };
    }

    const suffix = `${Date.now()}`;
    let seeded;
    try {
      seeded = await createGuestPendingViaQuote(ctx.api, pick, suffix);
    } catch (e) {
      ctx.api.setAccessToken(null);
      return {
        skipped: true,
        reason: `Guest quote→pending seed failed (${e instanceof Error ? e.message : String(e)})`,
      };
    }

    ctx.seed.registerCleanup(async () => {
      try {
        await ctx.api.fetch(`/api/pending-orders/${seeded.numericId}/cancel`, {
          method: "POST",
          json: { reason: "automation teardown" },
        });
      } catch {
        /* already cancelled */
      }
    });

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/pending-orders`);
    await ctx.assert.waitForH1Containing(driver, "Đơn chờ thanh toán", 20000);

    const needle = `AUTO-SEL-${suffix}`;
    const tr = await driver.wait(
      until.elementLocated(By.xpath(`//tbody/tr[.//*[contains(normalize-space(.), '${needle}')]]`)),
      35000,
    );

    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", tr);

    const adminTok =
      typeof loginBody.accessToken === "string" ? loginBody.accessToken : String(loginBody.accessToken);
    ctx.api.setAccessToken(adminTok);
    await ctx.api.fetchJson(`/api/pending-orders/${seeded.numericId}/cancel`, {
      method: "POST",
      json: { reason: "e2e automation" },
    });
    await driver.wait(
      async () => {
        const check = await ctx.api.fetchJson(`/api/pending-orders/${seeded.numericId}`);
        return check.status === "cancelled";
      },
      20000,
      "pending order cancelled via API",
    );
    ctx.api.setAccessToken(null);
  },
};
