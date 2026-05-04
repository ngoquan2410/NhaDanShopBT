import { waitForH1Containing } from "../helpers/assertions.mjs";

/** Phase 5+ users, customers, suppliers, security (TOTP panel surface). */
export default {
  name: "Phase 5+: users / customers / suppliers / security admin smoke",
  tags: ["admin", "p5-directory"],
  order: 55,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for p5-directory" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    await ctx.api.fetchJson("/api/admin/users?page=0&size=5");
    await ctx.api.fetchJson("/api/customers");
    await ctx.api.fetchJson("/api/suppliers");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    for (const [path, title] of [
      ["/admin/users", "Người dùng"],
      ["/admin/customers", "Khách hàng"],
      ["/admin/suppliers", "Nhà cung cấp"],
      ["/admin/security", "Bảo mật"],
    ]) {
      await driver.get(`${origin}${path}`);
      await waitForH1Containing(driver, title, 25000);
    }

    ctx.api.setAccessToken(null);
  },
};
