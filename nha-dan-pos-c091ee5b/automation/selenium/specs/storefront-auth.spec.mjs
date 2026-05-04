import { By, until } from "selenium-webdriver";
import {
  fillCheckoutContactAndStreet,
  findSellableProductLine,
  selectFirstFullAddress,
} from "../helpers/storefrontFlows.mjs";
import { createGuestPendingViaQuote } from "../helpers/adminSales.mjs";

export default {
  name: "Storefront + auth journeys (browse, combos, checkout, signup/login, account loyalty, admin gate)",
  tags: ["storefront", "storefront-auth-suite"],
  order: 45,
  /** @param {import('selenium-webdriver').WebDriver} driver */
  async run(driver, ctx) {
    const { config, api, auth, assert } = ctx;
    const origin = config.baseUrl.replace(/\/$/, "");
    const { waitForTitle, waitForH1Containing, waitForUrlContains } = assert;

    const loyaltySettings = await api.fetchJson("/api/loyalty/settings");
    if (loyaltySettings == null || typeof loyaltySettings !== "object") {
      throw new Error("/api/loyalty/settings returned unexpected body");
    }

    const combos = await api.fetchJson("/api/combos/active");
    if (!Array.isArray(combos)) {
      throw new Error("/api/combos/active must return a JSON array");
    }

    await driver.get(`${origin}/`);
    await waitForTitle(driver, /Nhã Đan Shop/);

    await driver.get(`${origin}/products`);
    await waitForH1Containing(driver, "Tất cả sản phẩm", 35000);

    await driver.get(`${origin}/combos`);
    await driver.wait(
      async () => {
        const bodyTxt = await driver.findElement(By.css("body")).getText();
        return (
          bodyTxt.includes("Combo tiết kiệm") ||
          bodyTxt.includes("Combo gia đình") ||
          bodyTxt.includes("Chưa có combo khuyến mãi") ||
          bodyTxt.includes("Combo chưa khả dụng")
        );
      },
      35000,
    );

    await driver.get(`${origin}/cart`);
    await driver.wait(
      async () => {
        const bodyTxt = await driver.findElement(By.css("body")).getText();
        return bodyTxt.includes("Giỏ hàng đang trống") || bodyTxt.includes("Giỏ của bạn");
      },
      25000,
    );

    if (combos.length > 0) {
      await driver.get(`${origin}/combos`);
      const addBtns = await driver.findElements(By.xpath("//button[contains(.,'Thêm vào giỏ')]"));
      if (addBtns.length === 0) {
        console.warn("  ⚠ combos: no 'Thêm vào giỏ' CTA — derivedStock UI may gate card");
      } else {
        await addBtns[0].click();
        await driver.sleep(600);
      }
    }

    await driver.get(`${origin}/signup`);
    await waitForH1Containing(driver, "Tạo tài khoản", 20000);

    await driver.findElement(By.css('input[autocomplete="username"]')).clear();
    await driver.findElement(By.css('input[autocomplete="username"]')).sendKeys("e2e_weak_user");
    const pwInputsWeak = await driver.findElements(By.css('input[autocomplete="new-password"]'));
    if (pwInputsWeak.length >= 2) {
      await pwInputsWeak[0].clear();
      await pwInputsWeak[0].sendKeys("short");
      await pwInputsWeak[1].clear();
      await pwInputsWeak[1].sendKeys("short");
    }
    await driver.findElement(By.xpath("//button[@type='submit' and contains(.,'Tạo tài khoản')]")).click();
    await driver.sleep(900);
    if ((await driver.getCurrentUrl()).includes("/account")) {
      throw new Error("Signup accepted obviously weak password");
    }

    if (process.env.E2E_SIGNUP === "1") {
      const u = `e2e_sf_${Date.now()}`;
      const p = process.env.E2E_SIGNUP_PASSWORD?.trim() || "E2e_Shop_pass!987";
      await driver.get(`${origin}/signup`);
      await driver.findElement(By.css('input[autocomplete="username"]')).clear();
      await driver.findElement(By.css('input[autocomplete="username"]')).sendKeys(u);
      const pwNew = await driver.findElements(By.css('input[autocomplete="new-password"]'));
      await pwNew[0].clear();
      await pwNew[0].sendKeys(p);
      await pwNew[1].clear();
      await pwNew[1].sendKeys(p);
      await driver.findElement(By.xpath("//button[@type='submit' and contains(.,'Tạo tài khoản')]")).click();
      await driver.wait(async () => (await driver.getCurrentUrl()).includes("/account"), 60000);
      await auth.logoutViaUiIfVisible(driver);
      await driver.sleep(800);
    }

    await driver.get(`${origin}/forgot-password`);
    await waitForH1Containing(driver, "Quên mật khẩu", 20000);
    await driver.findElement(By.xpath("//label[contains(.,'Tên đăng nhập')]//following::input[1]")).clear();
    await driver
      .findElement(By.xpath("//label[contains(.,'Tên đăng nhập')]//following::input[1]"))
      .sendKeys("__automation_no_user__");
    await driver.findElement(By.xpath("//button[@type='submit' and contains(.,'Gửi')]")).click();
    await driver.sleep(900);

    await driver.get(`${origin}/reset-password?token=fixture`);
    await waitForH1Containing(driver, "Đặt lại mật khẩu", 20000);
    const tokenFields = await driver.findElements(By.xpath("//label[contains(.,'Token')]"));
    if (tokenFields.length > 0) {
      throw new Error("Reset password UI must not expose an editable Token field");
    }

    await driver.get(`${origin}/login?next=${encodeURIComponent("/cart")}`);
    const loginUrl = await driver.getCurrentUrl();
    if (!loginUrl.includes("next=")) {
      throw new Error("Expected /login URL to preserve next= fragment");
    }

    await driver.get(`${origin}/login`);
    await waitForH1Containing(driver, "Đăng nhập", 20000);

    const inventoryLine = await findSellableProductLine(api);
    if (!inventoryLine) {
      console.warn("  ⚠ Skip checkout — no sellable SKU (stock > 0) from /api/products — seed FE/BE fixtures for full funnel.");
    } else {
      await driver.get(`${origin}/products/${inventoryLine.productId}`);
      await driver.wait(until.elementLocated(By.xpath("//button[contains(.,'Thêm vào giỏ')]")), 60000);
      await driver.findElement(By.xpath("//button[contains(.,'Thêm vào giỏ')]")).click();
      await driver.sleep(900);

      await driver.get(`${origin}/cart`);
      const checkoutBtn = await driver.wait(
        until.elementLocated(By.xpath("//a[contains(.,'Tiến hành thanh toán')]")),
        45000,
      );
      await checkoutBtn.click();

      await waitForUrlContains(driver, "/checkout", 30000);
      await waitForH1Containing(driver, "Hoàn tất đơn hàng", 30000);

      await driver.wait(until.elementLocated(By.xpath("//label[contains(.,'Tỉnh / Thành phố')]")), 12000);

      await fillCheckoutContactAndStreet(driver, { name: "E2E Khách QA", phone: "0912345678" });
      await selectFirstFullAddress(driver);

      const det = await api.fetchJson(`/api/products/${inventoryLine.productId}`);
      const v = (det.variants ?? []).find(
        (x) => x.isSellable !== false && Number(x.stockQty ?? x.stock ?? 0) > 0,
      );
      if (!v?.id) throw new Error("storefront-auth: no in-stock variant for quote seed");
      const pick = {
        productId: Number(det.id),
        variantId: Number(v.id),
        variantCode: String(v.variantCode ?? ""),
        batchId: null,
      };
      const suf = `${Date.now()}`;
      const seeded = await createGuestPendingViaQuote(api, pick, suf);
      await driver.get(`${origin}/pending-payment/${encodeURIComponent(seeded.id)}`);

      await driver.wait(async () => (await driver.getCurrentUrl()).includes("/pending-payment"), 60000);

      await driver.wait(
        async () => (await driver.findElement(By.css("body")).getText()).includes("Đang chờ thanh toán"),
        35000,
      );
    }

    if (config.userUsername && config.userPassword) {
      const loginBody = await api.authLoginJson(config.userUsername, config.userPassword);
      if (loginBody?.totpRequired) {
        const err = new Error(
          "USER profile requires TOTP — use a staging user without TOTP for automation.",
        );
        err.code = "TOTP_REQUIRED";
        throw err;
      }
      const token = loginBody?.accessToken;
      if (!token || typeof token !== "string") {
        throw new Error("/api/auth/login did not return accessToken for USER_USERNAME identity");
      }
      api.setAccessToken(token);
      await api.fetchJson("/api/account/me");
      await api.fetchJson("/api/account/orders?page=0&size=10");
      await api.fetchJson("/api/account/points");
      api.setAccessToken(null);

      await auth.loginViaUi(driver, config, {
        username: config.userUsername,
        password: config.userPassword,
        nextPath: "/admin",
      });
      await driver.wait(async () => (await driver.getCurrentUrl()).includes("/account"), 30000);

      await driver.wait(
        async () =>
          (await driver.findElement(By.css("body")).getText()).includes("Điểm tích lũy") &&
          (await driver.findElement(By.css("body")).getText()).includes("Đơn hàng gần đây"),
        35000,
      );

      await driver.get(`${origin}/admin`);
      await waitForUrlContains(driver, "/account", 30000);

      await auth.logoutViaUiIfVisible(driver);
      await resetSessionLoose(driver, origin);

      await auth.loginViaUi(driver, config, {
        username: config.userUsername,
        password: config.userPassword,
        nextPath: "/cart",
      });
      await waitForUrlContains(driver, "/cart", 35000);

      const invLineUser = await findSellableProductLine(api);
      if (invLineUser) {
        await driver.get(`${origin}/products/${invLineUser.productId}`);
        await driver.wait(
          until.elementLocated(By.xpath("//button[contains(.,'Thêm vào giỏ')]")),
          60000,
        );
        await driver.findElement(By.xpath("//button[contains(.,'Thêm vào giỏ')]")).click();
        await driver.sleep(900);
        await driver.get(`${origin}/cart`);
        const checkoutUser = await driver.wait(
          until.elementLocated(By.xpath("//a[contains(.,'Tiến hành thanh toán')]")),
          45000,
        );
        await checkoutUser.click();
        await waitForUrlContains(driver, "/checkout", 30000);
        await waitForH1Containing(driver, "Hoàn tất đơn hàng", 30000);
        await driver.wait(until.elementLocated(By.xpath("//label[contains(.,'Tỉnh / Thành phố')]")), 12000);
        await fillCheckoutContactAndStreet(driver, { name: "E2E User PO", phone: "0912000888" });
        await selectFirstFullAddress(driver);
        const pendBtn = await driver.wait(
          until.elementLocated(By.css('[data-testid="checkout-create-pending"]')),
          30000,
        );
        await driver.wait(until.elementIsEnabled(pendBtn), 120000);
        await pendBtn.click();
        await driver.wait(async () => (await driver.getCurrentUrl()).includes("/pending-payment"), 60000);
        const bod = await driver.findElement(By.css("body")).getText();
        if (bod.includes("Khách vãng lai không được gắn customerId")) {
          throw new Error("Logged-in storefront checkout must send auth with pending-order create");
        }
      } else {
        console.warn("  ⚠ Skip logged-in pending — no sellable SKU from API");
      }

      resetSessionLoose(driver, origin);
    } else {
      console.warn("  ⚠ Set USER_USERNAME + USER_PASSWORD — covers /api/account/* + loyalty UI + /admin denial + login next=/cart.");
    }
  },
};

/**
 * Lightweight storage wipe without importing runner helpers circularly.
 * @param {import('selenium-webdriver').WebDriver} driver
 */
async function resetSessionLoose(driver, origin) {
  await driver.get(`${origin}/`);
  await driver.manage().deleteAllCookies();
  await driver.executeScript(`
    try {
      window.localStorage?.clear?.();
      window.sessionStorage?.clear?.();
    } catch (e) {}
  `);
}
