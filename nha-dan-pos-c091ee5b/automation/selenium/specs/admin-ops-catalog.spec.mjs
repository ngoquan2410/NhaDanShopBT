import { waitForH1Containing } from "../helpers/assertions.mjs";

/**
 * Phase 5a — Catalog admin journeys + public combo list; complements
 * {@link com.example.nhadanshop.integration.Phase5CatalogCombosImagesMvcIntegrationTest}.
 */
export default {
  name: "Phase 5a: catalog admin + storefront combo visibility (API + UI smoke)",
  tags: ["admin", "p5-catalog"],
  order: 50,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for admin-ops / p5-catalog" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("Missing accessToken from /api/auth/login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    const categories = await ctx.api.fetchJson("/api/categories");
    if (!Array.isArray(categories)) throw new Error("/api/categories must return an array");

    const activeUrl = `${ctx.config.apiBaseUrl.replace(/\/$/, "")}/api/combos/active`;
    const acRes = await fetch(activeUrl, { headers: { Accept: "application/json" } });
    if (!acRes.ok) throw new Error(`/api/combos/active HTTP ${acRes.status}`);
    const activeCombos = await acRes.json();
    if (!Array.isArray(activeCombos)) throw new Error("/api/combos/active must return an array");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    for (const [path, title] of [
      ["/admin/categories", "Danh mục"],
      ["/admin/products", "Sản phẩm"],
      ["/admin/combos", "Combo"],
    ]) {
      await driver.get(`${origin}${path}`);
      await waitForH1Containing(driver, title, 25000);
    }

    await driver.get(`${origin}/combos`);
    await waitForH1Containing(driver, "Combo gia đình", 25000);

    ctx.api.setAccessToken(null);
    void activeCombos;
  },
};
