import { By, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import * as fx from "../helpers/e2eFixtures.mjs";

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

    const suffix = fx.uniq("ctl");
    const catCtl = await fx.ensureCategory(ctx.api, `E2E-CAT-${suffix}`);
    await fx.ensureProduct(ctx.api, catCtl, `E2E-MNU-${suffix}`, `E2E-MNV-${suffix}`);
    const pcode = `E2E-MNU-${suffix}`;

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    /** Deep-link clears controlled-input sync issues vs typing into the grid filter alone. */
    const productsListUrl = `${origin}/admin/products?q=${encodeURIComponent(pcode)}`;

    for (const [path, title] of [
      ["/admin/categories", "Danh mục"],
      [productsListUrl, "Sản phẩm"],
      ["/admin/combos", "Combo"],
    ]) {
      await driver.get(`${origin}${path.startsWith("http") ? path.slice(origin.length) : path}`);
      await waitForH1Containing(driver, title, 25000);
    }

    await driver.get(productsListUrl);
    await waitForH1Containing(driver, "Sản phẩm", 25000);

    const trigger = await driver.wait(
      until.elementLocated(By.xpath(`//tbody//tr[contains(.,'${pcode}')]//button[@aria-label='Thao tác']`)),
      45000,
    );
    await trigger.click();
    await driver.wait(until.elementLocated(By.xpath(`//*[@role='menuitem' and contains(.,'Xem chi tiết')]`)), 10000).click();
    await waitForH1Containing(driver, pcode, 25000);
    await driver.get(`${origin}/combos`);
    await waitForH1Containing(driver, "Combo gia đình", 25000);

    await driver.get(`${origin}/admin/products/new`);
    await waitForH1Containing(driver, "Tạo sản phẩm mới", 25000);
    await driver.wait(
      until.elementLocated(By.xpath("//select[.//option[normalize-space(.)!='Chọn danh mục']]")),
      20000,
    );

    /** Product Excel import: template download + concise guide (no legacy filename in copy). */
    await driver.get(`${origin}/admin/products`);
    await waitForH1Containing(driver, "Sản phẩm", 25000);
    await driver.findElement(By.xpath(`//button[contains(normalize-space(.),'Nhập Excel')]`)).click();
    await driver.wait(until.elementLocated(By.xpath(`//h3[contains(normalize-space(.),'Nhập Excel sản phẩm')]`)), 15000);
    await driver.wait(until.elementLocated(By.xpath(`//button[contains(normalize-space(.),'Tải template Excel')]`)), 8000);
    const prodDlgText = await driver.findElement(By.xpath(`//h3[contains(.,'Nhập Excel sản phẩm')]/ancestor::div[contains(@class,'rounded-lg')]`)).getText();
    if (/Copy of template_import_san_pham/i.test(prodDlgText)) {
      throw new Error("product import modal still mentions legacy Copy of template_import_san_pham filename");
    }
    await driver.findElement(By.xpath(`//button[contains(normalize-space(.),'Tải template Excel')]`)).click();
    await driver.wait(until.elementLocated(By.xpath(`//h3[contains(.,'Nhập Excel sản phẩm')]`)), 5000);
    await driver.findElement(By.xpath(`//h3[contains(.,'Nhập Excel sản phẩm')]/ancestor::div[contains(@class,'border-b')]//button[last()]`)).click();

    /** Receipt Excel import: same assertions on phiếu nhập list. */
    await driver.get(`${origin}/admin/goods-receipts`);
    await waitForH1Containing(driver, "Phiếu nhập", 25000);
    await driver.findElement(By.xpath(`//button[contains(normalize-space(.),'Nhập Excel')]`)).click();
    await driver.wait(until.elementLocated(By.xpath(`//h3[contains(normalize-space(.),'Nhập Excel phiếu nhập')]`)), 15000);
    await driver.wait(until.elementLocated(By.xpath(`//button[contains(normalize-space(.),'Tải template Excel')]`)), 8000);
    const rcpDlgText = await driver.findElement(By.xpath(`//h3[contains(.,'Nhập Excel phiếu nhập')]/ancestor::div[contains(@class,'rounded-lg')]`)).getText();
    if (/template_import_phieu_nhap_kho-\s*Bánh tráng Tìn Tìn/i.test(rcpDlgText)) {
      throw new Error("receipt import modal still mentions legacy template_import_phieu filename");
    }
    await driver.findElement(By.xpath(`//button[contains(normalize-space(.),'Tải template Excel')]`)).click();
    await driver.wait(until.elementLocated(By.xpath(`//h3[contains(.,'Nhập Excel phiếu nhập')]`)), 5000);
    await driver.findElement(By.xpath(`//h3[contains(.,'Nhập Excel phiếu nhập')]/ancestor::div[contains(@class,'border-b')]//button[last()]`)).click();

    ctx.api.setAccessToken(null);
    void activeCombos;
  },
};
