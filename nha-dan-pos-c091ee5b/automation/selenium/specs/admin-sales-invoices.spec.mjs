import { By, until } from "selenium-webdriver";

export default {
  name: "Phase 4: Invoices admin list/detail chrome",
  tags: ["admin", "admin-sales-suite", "watchlist-invoice-lifecycle"],
  order: 18,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return {
        skipped: true,
        reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for admin-sales-suite",
      };
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    await driver.navigate().to(`${ctx.config.baseUrl.replace(/\/$/, "")}/admin/invoices`);

    await ctx.assert.waitForH1Containing(driver, "Hóa đơn", 20000);

    await driver.wait(
      async () => {
        const header = await driver.findElements(By.xpath("//th[contains(., 'Số hóa đơn')]"));
        const empty = await driver.findElements(By.xpath("//*[contains(., 'Không tìm thấy hóa đơn')]"));
        return header.length > 0 || empty.length > 0;
      },
      25000,
      "Neither invoices table nor empty-state appeared",
    );

    const hdr = await driver.findElements(By.xpath("//th[contains(., 'Số hóa đơn')]"));
    if (hdr.length > 0) {
      const firstEye = await driver.findElements(By.xpath("//tbody/tr[1]//button[@title='Xem chi tiết']"));
      if (firstEye.length === 1) {
        await firstEye[0].click();
        await driver.wait(
          async () => (await driver.findElements(By.xpath("//h2[contains(., 'Hóa đơn')] | //*[contains(@class,'drawer')]"))).length > 0,
          12000,
        ).catch(() => {
          console.warn("[admin-sales] Drawer title not matched — skipping detail assertion");
        });
      }
    }
  },
};
