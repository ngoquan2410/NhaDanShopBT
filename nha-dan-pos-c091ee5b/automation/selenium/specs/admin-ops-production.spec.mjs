import { waitForH1Containing } from "../helpers/assertions.mjs";
import { By, until } from "selenium-webdriver";

/** Phase 5c — Production recipes / orders (depends on bytea/UI fixes in plan). */
export default {
  name: "Phase 5c: production list + recipe form layout smoke",
  tags: ["admin", "p5-production", "watchlist-combo-production"],
  order: 52,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for p5-production" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    await ctx.api.fetchJson("/api/production-recipes?page=0&size=5");
    await ctx.api.fetchJson("/api/production-orders?page=0&size=5&sort=createdAt,desc");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/production`);
    await waitForH1Containing(driver, "Sản xuất / đóng gói", 25000);

    await driver.get(`${origin}/admin/production/recipes/new`);
    await waitForH1Containing(driver, "Tạo quy trình sản xuất", 25000);
    await driver.wait(
      until.elementLocated(By.xpath("//a[contains(.,'Tạo sản phẩm mới')]")),
      15000,
    );

    ctx.api.setAccessToken(null);
  },
};
