import { By, until } from "selenium-webdriver";
import {
  dashboardAlertsFromProjections,
  pendingOpenFromDashboardSlice,
} from "../helpers/adminSales.mjs";

export default {
  name: "Phase 4: dashboard stock/pending counts match projections API slice",
  tags: ["admin", "admin-sales-suite", "watchlist-inventory-truth"],
  order: 15,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return {
        skipped: true,
        reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for admin-sales-suite",
      };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) {
      throw new Error("Missing accessToken from /api/auth/login");
    }
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    if (!Array.isArray(projections)) {
      throw new Error("inventory projections response is not an array");
    }
    const alerts = dashboardAlertsFromProjections(projections);

    const pendPage = await ctx.api.fetchJson(
      "/api/pending-orders?page=0&size=12&sort=createdAt,desc",
    );
    const pendingOpen = pendingOpenFromDashboardSlice(pendPage);

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });

    await driver.wait(
      until.elementLocated(By.xpath(`//h3[contains(., 'Sắp hết hàng (${alerts.lowStockCount})')]`)),
      25000,
    );
    await driver.wait(
      until.elementLocated(By.xpath(`//h3[contains(., 'Hết hàng (${alerts.outOfStockCount})')]`)),
      8000,
    );
    await driver.wait(
      until.elementLocated(By.xpath(`//h3[contains(., 'Sắp hết HSD (${alerts.nearExpiryCount})')]`)),
      8000,
    );
    await driver.wait(
      until.elementLocated(By.xpath(`//h3[contains(., 'Hết HSD (${alerts.expiredCount})')]`)),
      8000,
    );

    const badges = await driver.findElements(By.xpath("//span[contains(normalize-space(.), ' mở')]"));
    if (badges.length === 0) throw new Error("Pending badge 'N mở' not rendered on dashboard");
    const badgeText = await badges[0].getText();
    const mOpen = /^(\d+)\s*mở\s*$/i.exec(badgeText.trim());
    if (!mOpen) throw new Error(`Unexpected pending badge format: '${badgeText}'`);
    const shown = Number(mOpen[1]);
    if (shown !== pendingOpen) {
      throw new Error(
        `Dashboard pending badge ${shown} != API slice expectation ${pendingOpen} (dashboard uses page 12 only)`,
      );
    }

    const todayCol = await driver.findElement(By.xpath("//span[normalize-space(.)='Đơn chờ xử lý']/following-sibling::*[1]"));
    const pendToday = Number((await todayCol.getText()).replace(/\s+/g, "").trim());
    if (pendToday !== pendingOpen) {
      throw new Error(`Today's pending column showed ${pendToday}; expected slice ${pendingOpen}`);
    }

    ctx.api.setAccessToken(null);
  },
};
