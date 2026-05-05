import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/** Phase 5+ promotions / vouchers admin + public evaluate hygiene. */
export default {
  name: "Phase 5+: promotions & vouchers admin + evaluate validation",
  tags: ["admin", "p5-commercial"],
  order: 53,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for p5-commercial" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    await ctx.api.fetchJson("/api/promotions?page=0&size=5");
    await ctx.api.fetchJson("/api/vouchers?page=0&size=5");

    const evRes = await ctx.api.fetch("/api/promotions/evaluate", {
      method: "POST",
      json: { lines: [] },
    });
    if (evRes.status !== 400) {
      throw new Error(`Expected 400 for empty promotion evaluate lines, got ${evRes.status}`);
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/promotions`);
    await waitForH1Containing(driver, "Khuyến mãi", 25000);
    const mkBtn = await driver.findElements(By.xpath("//button[contains(.,'Tạo khuyến mãi')]"));
    if (mkBtn.length) await mkBtn[0].click();
    await driver.wait(until.elementLocated(By.xpath("//h2|//h3")), 8000).catch(() => {});

    await driver.get(`${origin}/admin/vouchers`);
    await waitForH1Containing(driver, "Voucher / Mã giảm giá", 25000);
    const vAdd = await driver.findElements(By.xpath("//button[contains(.,'Thêm voucher')]"));
    if (vAdd.length) {
      await vAdd[0].click();
      await driver.wait(
        until.elementLocated(By.xpath(`//*[contains(normalize-space(.),'Thêm voucher mới')]`)),
        15000,
      );
    }

    ctx.api.setAccessToken(null);
  },
};
