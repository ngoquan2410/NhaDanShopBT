import { By, until } from "selenium-webdriver";
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

    await driver.get(`${origin}/admin/customers`);
    await waitForH1Containing(driver, "Khách hàng", 25000);
    const addCust = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(.,'Thêm khách hàng')]")),
      15000,
    );
    await addCust.click();
    await driver.wait(until.elementLocated(By.css("#customer-drawer-root, [role='dialog'], input")), 8000).catch(() => {});

    await driver.get(`${origin}/admin/suppliers`);
    await waitForH1Containing(driver, "Nhà cung cấp", 25000);
    const addSup = await driver.findElements(By.xpath("//button[contains(.,'Thêm')]"));
    if (addSup.length) {
      await addSup[0].click();
    }
    const sufDir = `dir-${Date.now().toString(36)}`;
    const nameInp = await driver.wait(
      until.elementLocated(By.xpath("//label[contains(.,'Tên NCC')]//following::input[1]")),
      15000,
    );
    await nameInp.clear();
    await nameInp.sendKeys(`E2E SEL NCC ${sufDir}`);
    const tel = await driver.findElement(By.xpath("//label[contains(.,'Số điện thoại')]//following::input[1]"));
    await tel.clear();
    await tel.sendKeys(`0977${Math.floor(Math.random() * 1e6)
      .toString()
      .padStart(6, "0")}`);
    const submit = await driver.wait(until.elementLocated(By.xpath("//button[contains(.,'Thêm mới')]")), 10000);
    await submit.click();
    await driver.wait(
      async () => (await driver.findElement(By.css("body")).getText()).includes(`E2E SEL NCC ${sufDir}`),
      25000,
    );

    ctx.api.setAccessToken(null);
  },
};
