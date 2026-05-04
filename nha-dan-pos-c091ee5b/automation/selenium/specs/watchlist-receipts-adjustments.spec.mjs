import { waitForH1Containing } from "../helpers/assertions.mjs";
import { pickSellableVariantScan } from "../helpers/adminSales.mjs";

/** GATE — Receipt void path + projections delta sanity (API-heavy; UI shells goods-receipts list). */
export default {
  name: "Gate (watchlist-receipts-adjustments): POST receipt → void idempotent teardown + receipts page load",
  tags: ["admin", "p5-inventory", "watchlist-receipts-adjustments"],
  order: 57,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) return { skipped: true, reason: "ADMIN_USERNAME / ADMIN_PASSWORD" };

    const login = await ctx.api.authLoginJson(u, p);
    const tok = login.accessToken;
    if (!tok) throw new Error("login");
    ctx.api.setAccessToken(typeof tok === "string" ? tok : String(tok));

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections) : null;
    if (!pick?.variantCode) {
      ctx.api.setAccessToken(null);
      return { skipped: true, reason: "No SKU for receipt smoke" };
    }

    function qtyVid(rows, vid) {
      for (const raw of rows) {
        const r = typeof raw === "object" && raw !== null ? raw : {};
        if (Number(r.variantId) === Number(vid)) return Number(r.available ?? r.onHand ?? NaN);
      }
      return NaN;
    }

    const proj0 = await ctx.api.fetchJson("/api/inventory/projections");
    const before = qtyVid(proj0, pick.variantId);

    const body = {
      supplierName: `WATCHLIST-NCC-${Date.now()}`,
      supplierId: null,
      note: null,
      shippingFee: 0,
      vatPercent: 0,
      comboItems: [],
      items: [
        {
          productId: pick.productId,
          quantity: 2,
          unitCost: 4000,
          discountPercent: 0,
          importUnit: "cai",
          piecesOverride: 1,
          variantId: pick.variantId,
          expiryDateOverride: "2035-06-01",
        },
      ],
      receiptDate: (() => {
        const d = new Date();
        d.setMinutes(d.getMinutes() - 10);
        return d.toISOString().slice(0, 19);
      })(),
    };

    const created = await ctx.api.fetchJson("/api/receipts", {
      method: "POST",
      json: body,
    });
    const rid = created.id;
    if (!rid) throw new Error("receipt created without id");

    const projMid = await ctx.api.fetchJson("/api/inventory/projections");
    const mid = qtyVid(projMid, pick.variantId);
    if (!(Number.isFinite(mid) && Number.isFinite(before) && mid >= before + 1)) {
      throw new Error(`Expected projections to rise after receipt; ${before} → ${mid}`);
    }

    const voidKey = `rcpt-void-${Date.now()}`;
    const voidUrl = `/api/receipts/${rid}/void`;
    const headers = { "Idempotency-Key": voidKey };
    for (let i = 0; i < 2; i++) {
      const res = await ctx.api.fetch(voidUrl, { method: "PATCH", json: {}, headers });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`receipt void HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
    }

    const projEnd = await ctx.api.fetchJson("/api/inventory/projections");
    const after = qtyVid(projEnd, pick.variantId);
    if (!(Number.isFinite(after) && Number.isFinite(before) && Math.abs(after - before) <= 2)) {
      throw new Error(`Receipt void replay should reconcile near baseline (${before} vs ${after})`);
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    await driver.get(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/goods-receipts`);
    await waitForH1Containing(driver, "Phiếu nhập", 25000);

    ctx.api.setAccessToken(null);
  },
};
