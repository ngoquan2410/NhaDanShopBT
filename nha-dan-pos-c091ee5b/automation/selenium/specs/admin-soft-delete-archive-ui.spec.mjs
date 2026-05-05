import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

/** Product deactivate guards + voucher toggle + CRM registry (inventory truth preserved via backend guards). */
export default {
  name: "Gate+: archive/deactivate guards + voucher toggle + CRM list",
  tags: ["admin", "p5-catalog", "p5-commercial", "p5-directory"],
  order: 61,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

    await fx.loginAdminApi(ctx.api, u, p);
    const suf = fx.uniq("arc");
    const catId = await fx.ensureCategory(ctx.api, `E2E-CAT-${suf}`);
    const zero = await fx.ensureProduct(ctx.api, catId, `E2E-Z-${suf}`, `E2E-ZV-${suf}`);
    const stocked = await fx.ensureProduct(ctx.api, catId, `E2E-S-${suf}`, `E2E-SV-${suf}`);
    await fx.postReceipt(ctx.api, {
      productId: stocked.productId,
      variantId: stocked.variantId,
      qty: 6,
      unitCost: 2500,
      expiry: "2036-03-01",
      supplierName: `E2E-NCC-${suf}`,
    });

    await ctx.api.fetchJson(`/api/products/${zero.productId}`, {
      method: "PATCH",
      json: { active: false },
    });

    let stockedBlocked = false;
    try {
      await ctx.api.fetchJson(`/api/products/${stocked.productId}`, {
        method: "PATCH",
        json: { active: false },
      });
    } catch (e) {
      const st = /** @type {{ response?: { status?: number } }} */ (e).response?.status;
      stockedBlocked = st === 409 || st === 400 || st === 422;
    }
    if (!stockedBlocked) {
      throw new Error("stocked product deactivate must be rejected by backend guard");
    }

    /** Voucher: create → toggle inactive (archive-style) */
    const t0 = new Date();
    const start = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate(), 0, 0, 0).toISOString().slice(0, 19);
    const end = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + 60, 23, 59, 0).toISOString().slice(0, 19);
    const vcode = `VX${Date.now().toString(36)}`.toUpperCase();
    const vch = await ctx.api.fetchJson("/api/vouchers", {
      method: "POST",
      json: {
        code: vcode,
        ruleSummary: "e2e soft-archive",
        active: true,
        minSubtotal: "0",
        percent: "3",
        cap: null,
        fixedAmount: null,
        freeShipping: false,
        startAt: start,
        endAt: end,
      },
    });
    await ctx.api.fetchJson(`/api/vouchers/${vch.id}/toggle`, { method: "PATCH" });

    const custName = `E2E CUST ${suf}`;
    await ctx.api.fetchJson("/api/customers", {
      method: "POST",
      json: {
        name: custName,
        phone: `0977${Math.floor(Math.random() * 1e6)
          .toString()
          .padStart(6, "0")}`,
        active: true,
      },
    });

    const projPacked = fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), stocked.variantId);
    const qPack = fx.projectionQty(projPacked, "onHand");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/products/${zero.productId}`);
    await waitForH1Containing(driver, `E2E-Z-${suf}`, 25000);
    await driver.wait(until.elementLocated(By.xpath(`//*[normalize-space(.)='Ngưng']`)), 15000);

    await driver.get(`${origin}/admin/customers`);
    await waitForH1Containing(driver, "Khách hàng", 25000);
    await driver.wait(
      async () =>
        (
          await driver
            .findElement(By.css("body"))
            .getText()
        ).includes(custName),
      35000,
    );

    ctx.api.setAccessToken(null);

    await fx.loginAdminApi(ctx.api, u, p);
    const qAfterOps = fx.projectionQty(fx.projectionForVariant(await ctx.api.fetchJson("/api/inventory/projections"), stocked.variantId), "onHand");
    if (qAfterOps !== qPack) throw new Error("archive/UI ops must not silently mutate stocked variant physical projection");
    ctx.api.setAccessToken(null);
  },
};
