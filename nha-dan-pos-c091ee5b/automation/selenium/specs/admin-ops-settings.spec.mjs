import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/**
 * Phase 5+ store/shipping/GHN logs/Goong test — third-party paths may 500 without keys;
 * UI must still render for diagnostics pages.
 */
export default {
  name: "Phase 5+: store & shipping settings + GHN logs + Goong test page",
  tags: ["admin", "p5-settings"],
  order: 54,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for p5-settings" };
    }

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    await ctx.api.fetchJson("/api/store/payment-settings");
    const originalShippingSettings = await ctx.api.fetchJson("/api/shipping/settings");
    ctx.seed.registerCleanup(async () => {
      ctx.api.setAccessToken(typeof token === "string" ? token : String(token));
      await ctx.api.fetchJson("/api/shipping/settings", {
        method: "PUT",
        json: originalShippingSettings,
      });
    });

    const localRule = {
      enabled: true,
      zoneCode: "LOCAL_MO_CAY",
      label: "Mỏ Cày local delivery",
      fee: 0,
      etaDays: { min: 1, max: 1 },
      provinceCodes: ["86", "83"],
      provinceNames: ["Vĩnh Long", "Bến Tre"],
      districtCodes: ["selenium-mo-cay"],
      districtNames: ["Mỏ Cày"],
      wardCodes: ["selenium-ward-mo-cay"],
      wardNames: ["Thị trấn Mỏ Cày"],
    };
    const savedShippingSettings = await ctx.api.fetchJson("/api/shipping/settings", {
      method: "PUT",
      json: {
        ...originalShippingSettings,
        localRules: [localRule],
      },
    });
    if (!Array.isArray(savedShippingSettings.localRules) || savedShippingSettings.localRules[0]?.zoneCode !== "LOCAL_MO_CAY") {
      throw new Error("shipping settings did not persist LOCAL_MO_CAY local rule");
    }

    const localQuote = await ctx.api.fetchJson("/api/shipping/quote", {
      method: "POST",
      json: {
        address: {
          provinceCode: "86",
          provinceName: "Vĩnh Long",
          districtCode: "selenium-mo-cay",
          districtName: "Mỏ Cày",
          wardCode: "selenium-ward-mo-cay",
          wardName: "Thị trấn Mỏ Cày",
          street: "Không dùng để match local rule",
          rawAddress: "Không dùng để match local rule",
        },
        subtotal: 50000,
        weightGrams: 500,
      },
    });
    if (localQuote.status !== "quoted" || localQuote.source !== "local_rule" || Number(localQuote.fee) !== 0) {
      throw new Error(`local Mỏ Cày quote expected source=local_rule fee=0, got ${JSON.stringify(localQuote)}`);
    }
    if (localQuote.usedFallback !== false || localQuote.zoneCode !== "LOCAL_MO_CAY") {
      throw new Error(`local Mỏ Cày quote should not use GHN fallback, got ${JSON.stringify(localQuote)}`);
    }

    const shipRes = await ctx.api.fetch("/api/shipping/quote", {
      method: "POST",
      json: {
        address: {
          provinceCode: "01",
          provinceName: "HN",
          districtCode: "1",
          districtName: "Q",
          wardCode: "1",
          wardName: "P",
        },
        subtotal: 50000,
        weightGrams: 500,
      },
    });
    if (!shipRes.ok) throw new Error(`shipping quote fallback expected 200, got ${shipRes.status}`);

    await ctx.api.fetchJson("/api/admin/ghn-quote-logs?page=0&size=5");

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/store-settings`);
    await waitForH1Containing(driver, "Cài đặt cửa hàng", 25000);

    await driver.get(`${origin}/admin/shipping-settings`);
    await waitForH1Containing(driver, "Cài đặt giao hàng", 25000);
    await driver.wait(until.elementLocated(By.xpath("//*[contains(., 'Local shipping rules')]")), 12000);
    await driver.wait(until.elementLocated(By.xpath("//*[contains(., 'LOCAL_MO_CAY')]")), 12000);

    await driver.get(`${origin}/admin/ghn-quote-logs`);
    await waitForH1Containing(driver, "Nhật ký báo giá GHN", 25000);

    await driver.get(`${origin}/admin/goong-test`);
    await waitForH1Containing(driver, "Goong API", 25000);

    await driver.get(`${origin}/admin`);
    await waitForH1Containing(driver, "Dashboard", 25000);
    await driver.executeScript(`
      window.dispatchEvent(new CustomEvent('nhadan:session-expired', { detail: { nextPath: '/admin/store-settings' } }));
    `);
    await driver.wait(until.elementLocated(By.css('[data-testid="session-expired-modal"]')), 12000);
    await driver.findElement(By.css('[data-testid="session-expired-login"]')).click();
    await driver.wait(async () => (await driver.getCurrentUrl()).includes("/login"), 15000);

    ctx.api.setAccessToken(null);
  },
};
