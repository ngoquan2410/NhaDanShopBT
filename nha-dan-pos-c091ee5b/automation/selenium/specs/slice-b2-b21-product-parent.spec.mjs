/**
 * Slice B2.1 — parent product search (admin topbar, products list, profit picker, promotion product scope, revenue picker).
 * Run: cross-env RUN_AUTOMATION=1 BASE_URL=... API_BASE_URL=... ADMIN_USERNAME=... ADMIN_PASSWORD=... node automation/selenium/run-selenium.mjs --run --tags=slice-b2-b21
 */
import { By, logging, until } from "selenium-webdriver";
import { waitForH1Containing } from "../helpers/assertions.mjs";

const HARD_B21_CASES = new Set([
  "admin_topbar_search_backend",
  "admin_products_search_backend",
  "profit_report_picker_backend",
  "promotion_product_picker_backend_product_scope",
  "revenue_report_picker_backend_regression",
]);

/** @param {string} c @param {string} s @param {Record<string, unknown>} extra */
function cr(c, s, extra = {}) {
  return {
    case: c,
    status: s,
    route: extra.route ?? "",
    file: extra.file ?? "",
    component: extra.component ?? "",
    searchToken: extra.searchToken,
    networkEvidence: extra.networkEvidence,
    pageSizeEvidence: extra.pageSizeEvidence,
    reason: extra.reason,
    selectionSemantic: extra.selectionSemantic ?? "",
    currentBehavior: extra.currentBehavior ?? "",
    changedByB2: extra.changedByB2 ?? false,
    followUpSlice: extra.followUpSlice,
    ...extra,
  };
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function assertNoSevereBrowserLogs(driver) {
  let entries;
  try {
    entries = await driver.manage().logs().get(logging.Type.BROWSER);
  } catch {
    return;
  }
  const bad = entries.filter((e) => e.level && String(e.level.name || e.level) === "SEVERE");
  if (bad.length) {
    const msg = bad.map((e) => e.message).join("\n");
    throw new Error(`Browser console SEVERE:\n${msg}`);
  }
}

/** @param {string[]} urls @param {number} size */
function urlsIncludePageSize(urls, size) {
  const re = new RegExp(`[?&]size=${size}(&|$)`);
  return urls.some((u) => re.test(String(u)));
}

function installProductFetchHook(driver) {
  return driver.executeScript(`
    window.__b21ProductFetches = [];
    const _fetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = function (...args) {
      try {
        const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        const s = String(u);
        if (s.includes('/api/products')) window.__b21ProductFetches.push(s);
      } catch (e) {}
      return _fetch(...args);
    };
  `);
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function waitForProductSearchUrl(driver, token, ms = 25000) {
  const enc = encodeURIComponent(token);
  return driver.executeAsyncScript(
    `
    const token = arguments[0];
    const enc = arguments[1];
    const ms = arguments[2];
    const done = arguments[arguments.length - 1];
    const deadline = Date.now() + ms;
    const tick = () => {
      const hooked = (window.__b21ProductFetches || []).filter(
        (u) => typeof u === 'string' && u.includes('/api/products') && u.includes('search='),
      );
      if (hooked.some((u) => u.includes('search=') && (u.includes(token) || u.includes(enc)))) {
        done({ ok: true, urls: hooked.slice(-8) });
        return;
      }
      if (Date.now() > deadline) done({ ok: false, urls: hooked.slice(-10) });
      else setTimeout(tick, 300);
    };
    tick();
    `,
    token,
    enc,
    ms,
  );
}

function debt(id, reason, file, route, followUpSlice) {
  return cr(id, "DEBT", { reason, file, route, changedByB2: false, followUpSlice });
}

/** Append B2.1 matrix tail (DEBT / STATIC / SKIPPED rows). Mutates `out`. */
function pushB21MatrixTail(out) {
  const classify = [
    ["production_recipe_output_search_backend", "B2.2 variant/picker debt", "B2.2"],
    ["production_recipe_component_search_backend", "B2.2", "B2.2"],
    ["combo_component_search_backend", "B2.2", "B2.2"],
    ["goods_receipt_create_variant_search_backend", "B2.2", "B2.2"],
    ["pos_search_classified_no_semantic_regression", "B2.2 POS", "B2.2"],
    ["pos_customer_picker_search_classified", "B2.3 entity lookup", "B2.3"],
    ["storefront_search_backend_or_slice_e_debt", "Slice E", "Slice E"],
    ["storefront_product_detail_related_products_classified", "Slice E", "Slice E"],
    ["stock_adjustments_list_search_backend", "B2.3", "B2.3"],
    ["stock_adjustment_create_variant_search_classified", "Slice D batch + B2.2", "Slice D"],
    ["invoices_list_search_backend", "B2.3", "B2.3"],
    ["pending_orders_list_search_backend", "B2.3", "B2.3"],
    ["production_recipes_list_search_backend", "B2.3", "B2.3"],
    ["customers_list_search_backend", "B2.3", "B2.3"],
    ["suppliers_list_search_backend", "B2.3", "B2.3"],
    ["goods_receipt_supplier_picker_search_classified", "B2.3", "B2.3"],
    ["inventory_report_search_classified", "B2.3", "B2.3"],
    ["users_management_search_classified", "Slice C overlap", "Slice C"],
    ["categories_search_static_small_classified", "Owner: STATIC_SMALL_ACCEPTED vs server search — classify manually", "—"],
    ["vouchers_list_search_backend", "Backend voucher list already uses search param", "—"],
    ["unmatched_payments_search_backend", "B2.3", "B2.3"],
    ["unmatched_payment_link_dialog_pending_order_search_backend", "B2.3", "B2.3"],
    ["ghn_quote_logs_search_classified", "B2.3", "B2.3"],
    ["admin_sidebar_pending_order_badge_classified", "Badge preload pageSize=500 — not user search", "—"],
  ];
  for (const [id, reason, slice] of classify) {
    const st =
      id === "categories_search_static_small_classified"
        ? "STATIC_SMALL_ACCEPTED"
        : id === "admin_sidebar_pending_order_badge_classified"
          ? "OUT_OF_SCOPE_NON_SEARCH_FIRST_N"
          : "DEBT";
    out.push(
      cr(id, st, {
        reason,
        followUpSlice: slice,
        changedByB2: false,
      }),
    );
  }
  out.push(
    cr("product_import_review_search_classified", "SKIPPED_WITH_REASON", {
      reason: "No stable upload fixture in B2.1 spec",
      file: "src/components/shared/ProductImportReview.tsx",
      changedByB2: false,
    }),
  );
}

/** Mark all hard B2.1 cases FAIL when setup never reaches UI. */
function pushHardCasesSetupBlocked(out, setupReason) {
  for (const id of HARD_B21_CASES) {
    out.push(
      cr(id, "FAIL", {
        reason: `setup blocked: ${setupReason}`,
        route: "",
        file: "",
        changedByB2: false,
      }),
    );
  }
}

export default {
  name: "Slice B2.1: parent product backend search (admin surfaces)",
  tags: ["slice-b2-b21", "slice-b2"],
  order: 49,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    const caseResults = [];

    if (!u || !p) {
      return {
        skipped: true,
        reason: "ADMIN_USERNAME / ADMIN_PASSWORD required",
        caseResults: [
          cr("admin_topbar_search_backend", "SKIPPED_WITH_REASON", {
            reason: "no admin creds",
            route: "/admin",
            file: "AdminTopbar.tsx",
          }),
        ],
      };
    }

    const ts = Date.now();
    const productCode = `ZZZ_SLICEB2_${ts}`;
    const variantCode = `ZZZ_SLICEB2_V_${ts}`;
    const name = `ZZZ SliceB2 ${ts}`;

    let fixtureProductId = "";
    try {
      const login = await ctx.api.authLoginJson(u, p);
      const token = login.accessToken;
      if (!token) {
        pushHardCasesSetupBlocked(caseResults, "login: no accessToken");
        pushB21MatrixTail(caseResults);
        return { caseResults, outcome: "fail", reason: "B2.1 setup: login: no accessToken" };
      }
      ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

      const cats = await ctx.api.fetchJson("/api/categories");
      const firstCat = Array.isArray(cats) ? cats[0] : null;
      const categoryId = Number(firstCat?.id);
      if (!Number.isFinite(categoryId)) {
        pushHardCasesSetupBlocked(caseResults, "need at least one category");
        pushB21MatrixTail(caseResults);
        return { caseResults, outcome: "fail", reason: "B2.1 setup: need at least one category" };
      }

      const created = await ctx.api.fetchJson("/api/products", {
        method: "POST",
        json: {
          code: productCode,
          name,
          categoryId,
          active: true,
          productType: "SINGLE",
          imageUrl: null,
          initialVariants: [
            {
              variantCode,
              variantName: "Line B21",
              sellUnit: "cái",
              importUnit: "cái",
              piecesPerUnit: 1,
              sellPrice: 1000,
              costPrice: 100,
              stockQty: 0,
              minStockQty: 0,
              expiryDays: null,
              isDefault: true,
              imageUrl: null,
              conversionNote: null,
              active: true,
              isSellable: true,
            },
          ],
        },
      });
      fixtureProductId = String(created.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushHardCasesSetupBlocked(caseResults, msg);
      pushB21MatrixTail(caseResults);
      return { caseResults, outcome: "fail", reason: `B2.1 setup: ${msg}` };
    }

    try {
      await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      pushHardCasesSetupBlocked(caseResults, `loginAsAdmin: ${msg}`);
      pushB21MatrixTail(caseResults);
      return { caseResults, outcome: "fail", reason: `B2.1 setup: loginAsAdmin: ${msg}` };
    }

    // ── Admin topbar: navigate first, then hook (reload drops monkey-patch) ──
    await driver.get(`${origin}/admin`);
    await waitForH1Containing(driver, "Dashboard", 30000);
    await installProductFetchHook(driver);
    const topInput = await driver.wait(
      until.elementLocated(By.css('input[placeholder*="Tìm sản phẩm"]')),
      15000,
    );
    await topInput.clear();
    await topInput.sendKeys(variantCode);
    const topPoll = await waitForProductSearchUrl(driver, variantCode);
    const topUrls = topPoll?.urls ?? [];
    const topTokenUrls = topUrls.filter((u) => u.includes(variantCode) || u.includes(encodeURIComponent(variantCode)));
    const topSearchOk =
      topPoll?.ok &&
      topTokenUrls.length > 0 &&
      topTokenUrls.every((u) => /[?&]size=8(&|$)/.test(String(u)) && !/[?&]size=50(&|$)/.test(String(u)));
    const topSizeOk = topSearchOk;
    const topRow = await driver
      .wait(
        until.elementLocated(
          By.xpath(`//div[contains(@class,'z-50')]//button[contains(@class,'w-full') and .//p[contains(normalize-space(.), "${name.replace(/"/g, '\\"')}")]]`),
        ),
        12000,
      )
      .catch(() => null);
    let topSevere = "";
    try {
      await assertNoSevereBrowserLogs(driver);
    } catch (e) {
      topSevere = e instanceof Error ? e.message : String(e);
    }
    const topPass = topSearchOk && topSizeOk && topRow != null && !topSevere;
    caseResults.push(
      cr("admin_topbar_search_backend", topPass ? "PASS" : "FAIL", {
        route: "/admin",
        file: "src/components/layout/AdminTopbar.tsx",
        searchToken: variantCode,
        networkEvidence: topUrls,
        pageSizeEvidence: topSizeOk ? "size=8" : "missing size=8",
        selectionSemantic: "PRODUCT_PARENT_SEARCH",
        currentBehavior: "debounced GET /api/products?search=…&page=0&size=8 (no topbar preload list for search)",
        changedByB2: true,
        reason: topPass
          ? undefined
          : [
              !topSearchOk ? "no matching /api/products?search= URL" : "",
              !topSizeOk ? "expected size=8" : "",
              !topRow ? "product row not in dropdown" : "",
              topSevere ? topSevere : "",
            ]
              .filter(Boolean)
              .join("; "),
      }),
    );

    // ── Admin products ───────────────────────────────────────────────────
    await driver.get(`${origin}/admin/products`);
    await waitForH1Containing(driver, "Sản phẩm", 20000);
    await installProductFetchHook(driver);
    const prodSearch = await driver.wait(
      until.elementLocated(By.css('input[placeholder="Tìm tên, mã sản phẩm..."]')),
      15000,
    );
    await prodSearch.clear();
    await prodSearch.sendKeys(productCode);
    const prodPoll = await waitForProductSearchUrl(driver, productCode);
    const prodUrls = prodPoll?.urls ?? [];
    const prodOk =
      prodPoll?.ok &&
      urlsIncludePageSize(prodUrls, 20) &&
      prodUrls.some((u) => u.includes("search=") && u.includes(encodeURIComponent(productCode)));
    await assertNoSevereBrowserLogs(driver);
    caseResults.push(
      cr("admin_products_search_backend", prodOk ? "PASS" : "FAIL", {
        route: "/admin/products",
        file: "src/pages/admin/Products.tsx",
        searchToken: productCode,
        networkEvidence: prodUrls,
        pageSizeEvidence: "size=20",
        selectionSemantic: "PRODUCT_PARENT_SEARCH",
        currentBehavior: "server page=20 + search query",
        changedByB2: true,
        reason: prodOk ? undefined : "backend search or size=20 not observed",
      }),
    );

    // ── Profit report picker ─────────────────────────────────────────────
    await driver.get(`${origin}/admin/profit`);
    await waitForH1Containing(driver, "Lợi nhuận", 20000);
    await installProductFetchHook(driver);
    const profitBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Lọc theo sản phẩm')]")),
      15000,
    );
    await profitBtn.click();
    const profitIn = await driver.wait(
      until.elementLocated(By.css('input[placeholder="Tìm sản phẩm..."]')),
      10000,
    );
    await profitIn.clear();
    await profitIn.sendKeys(productCode);
    const profitPoll = await waitForProductSearchUrl(driver, productCode);
    const profitUrls = profitPoll?.urls ?? [];
    const profitOk =
      profitPoll?.ok &&
      urlsIncludePageSize(profitUrls, 20) &&
      profitUrls.some((u) => u.includes("search=") && u.includes(encodeURIComponent(productCode)));
    await assertNoSevereBrowserLogs(driver);
    caseResults.push(
      cr("profit_report_picker_backend", profitOk ? "PASS" : "FAIL", {
        route: "/admin/profit",
        file: "src/pages/admin/ProfitReport.tsx",
        searchToken: productCode,
        networkEvidence: profitUrls,
        pageSizeEvidence: "size=20",
        selectionSemantic: "productId/productIds",
        currentBehavior: "debounced backend list for picker",
        changedByB2: true,
        reason: profitOk ? undefined : "backend search or size=20 not observed",
      }),
    );

    // ── Promotion PRODUCT scope + MultiPicker backend search ─────────────
    let promoOk = false;
    let promoUrls = [];
    let promoReason = "";
    try {
      await driver.get(`${origin}/admin/promotions`);
      await waitForH1Containing(driver, "Khuyến mãi", 20000);
      const createBtn = await driver.wait(
        until.elementLocated(By.xpath("//button[contains(., 'Tạo khuyến mãi')]")),
        15000,
      );
      await createBtn.click();
      await driver.wait(until.elementLocated(By.xpath("//h2[contains(., 'Tạo khuyến mãi')]")), 15000);
      const scopeProductBtn = await driver.wait(
        until.elementLocated(
          By.xpath(
            "//div[contains(@class,'max-w-xl') and contains(@class,'animate-slide-in-right')]//h3[contains(.,'Phạm vi áp dụng')]/following-sibling::div[1]//div[contains(@class,'flex gap-2')]//button[normalize-space()='Sản phẩm']",
          ),
        ),
        10000,
      );
      await scopeProductBtn.click();
      await driver.sleep(400);
      await installProductFetchHook(driver);
      const promoSearchInput = await driver.wait(
        until.elementLocated(By.css('input[placeholder="Tìm sản phẩm hoặc mã SP..."]')),
        10000,
      );
      await promoSearchInput.clear();
      await promoSearchInput.sendKeys(productCode);
      const promoPoll = await waitForProductSearchUrl(driver, productCode);
      promoUrls = promoPoll?.urls ?? [];
      const searchOk =
        promoPoll?.ok &&
        urlsIncludePageSize(promoUrls, 20) &&
        promoUrls.some((u) => u.includes("search=") && u.includes(encodeURIComponent(productCode)));
      const postPromotion = await driver.executeScript(`
        return (window.__b21ProductFetches || []).filter(u => typeof u === 'string' && u.includes('/api/promotions') && u.indexOf('/api/products') < 0);
      `);
      const badVariant = (promoUrls || []).some((u) => /variantId/i.test(String(u)));
      const pickRow = await driver.wait(
        until.elementLocated(
          By.xpath(
            `//div[contains(@class,'max-w-xl') and contains(@class,'animate-slide-in-right')]//div[contains(@class,'max-h-48')]//button[.//span[contains(text(),'${productCode}')] or .//span[contains(normalize-space(.),'${name.replace(/"/g, '\\"')}')]]`,
          ),
        ),
        12000,
      );
      await pickRow.click();
      await driver.sleep(300);
      const checked = await driver.findElements(
        By.xpath(
          `//div[contains(@class,'max-w-xl') and contains(@class,'animate-slide-in-right')]//button[contains(@class,'bg-primary-soft') and .//span[contains(text(),'${productCode}')]]`,
        ),
      );
      await assertNoSevereBrowserLogs(driver);
      promoOk =
        searchOk &&
        !badVariant &&
        checked.length > 0 &&
        (!Array.isArray(postPromotion) || postPromotion.length === 0);
      if (!promoOk) {
        promoReason = [
          !searchOk ? "search/size=20" : "",
          badVariant ? "variantId in product URL" : "",
          checked.length === 0 ? "product row not selected (product scope)" : "",
          Array.isArray(postPromotion) && postPromotion.length ? "unexpected /api/promotions mutation call" : "",
        ]
          .filter(Boolean)
          .join("; ");
      }
    } catch (e) {
      promoReason = e instanceof Error ? e.message : String(e);
      promoOk = false;
    }
    caseResults.push(
      cr("promotion_product_picker_backend_product_scope", promoOk ? "PASS" : "FAIL", {
        route: "/admin/promotions",
        file: "src/components/promotions/PromotionFormShell.tsx",
        searchToken: productCode,
        networkEvidence: promoUrls,
        pageSizeEvidence: "size=20",
        selectionSemantic: `productIds scope; fixture productId=${fixtureProductId}; no variantId; no promotion save`,
        currentBehavior: "MultiPicker remoteMode + GET /api/products?search=",
        changedByB2: true,
        reason: promoOk ? undefined : promoReason || "promotion picker flow failed",
      }),
    );
    try {
      const closeBtn = await driver.findElement(
        By.xpath("//div[contains(@class,'max-w-xl')]//div[contains(@class,'border-b')]//button[contains(@class,'hover:bg-muted')]"),
      );
      await closeBtn.click();
      await driver.sleep(400);
    } catch {
      await driver.get(`${origin}/admin`);
      await driver.sleep(400);
    }

    // ── Revenue regression ──────────────────────────────────────────────
    await driver.get(`${origin}/admin/revenue`);
    await waitForH1Containing(driver, "Doanh thu", 20000);
    await installProductFetchHook(driver);
    const revBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Lọc theo sản phẩm')]")),
      15000,
    );
    await revBtn.click();
    const revIn = await driver.wait(
      until.elementLocated(
        By.css('input[placeholder="Tìm sản phẩm / mã sản phẩm / mã variant"]'),
      ),
      10000,
    );
    await revIn.clear();
    await revIn.sendKeys(variantCode);
    const revPoll = await waitForProductSearchUrl(driver, variantCode);
    const revUrls = revPoll?.urls ?? [];
    const revOk =
      revPoll?.ok &&
      urlsIncludePageSize(revUrls, 20) &&
      revUrls.some((u) => u.includes("search=") && (u.includes(variantCode) || u.includes(encodeURIComponent(variantCode))));
    await assertNoSevereBrowserLogs(driver);
    const revBadVariant = revUrls.some((u) => /variantId/i.test(String(u)));
    caseResults.push(
      cr("revenue_report_picker_backend_regression", revOk && !revBadVariant ? "PASS" : "FAIL", {
        route: "/admin/revenue",
        file: "src/pages/admin/RevenueReport.tsx",
        searchToken: variantCode,
        networkEvidence: revUrls,
        pageSizeEvidence: "size=20",
        selectionSemantic: "productId/productIds (picker); regression = backend search only in this check",
        currentBehavior: "Slice B debounced search",
        changedByB2: false,
        reason: revOk && !revBadVariant ? undefined : [!revOk ? "search/size=20" : "", revBadVariant ? "variantId in product search URL" : ""].filter(Boolean).join("; "),
      }),
    );

    pushB21MatrixTail(caseResults);

    const hardFail = caseResults.filter((r) => HARD_B21_CASES.has(r.case) && r.status === "FAIL").length > 0;
    const failReason = hardFail
      ? `B2.1 hard FAIL: ${caseResults.filter((r) => HARD_B21_CASES.has(r.case) && r.status === "FAIL").map((r) => r.case).join(", ")}`
      : undefined;

    if (hardFail) {
      return { caseResults, outcome: "fail", reason: failReason };
    }
    return { caseResults, outcome: "pass" };
  },
};
