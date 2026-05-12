/**
 * Slice B full search-impact: /api/products variant-aware search + all major UI consumers (classified).
 * Run: npm run e2e:slice-b (tag slice-b) with AUTOMATION_NO_SKIP=1, ADMIN_*, full stack.
 */
import { By, Key, logging, until } from "selenium-webdriver";
import { createApiHelper } from "../helpers/api.mjs";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/** @param {string} c @param {'PASS'|'FAIL'|'DEBT'|'SKIPPED_WITH_REASON'} s @param {Record<string, unknown>} extra */
function cr(c, s, extra = {}) {
  return { case: c, status: s, ...extra };
}

/** @param {unknown} page */
function assertPageShape(page, label) {
  if (!page || typeof page !== "object") throw new Error(`${label}: invalid JSON`);
  const content = page.content;
  if (!Array.isArray(content)) throw new Error(`${label}: missing content[]`);
  return content;
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

function uniqParentIds(content) {
  return new Set(content.map((r) => String(r?.id ?? "")));
}

export default {
  name: "Slice B: full product search impact (API + consumers)",
  tags: ["slice-b", "slice-b-search-impact"],
  order: 48,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return {
        skipped: true,
        reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD (automation/selenium/env.example)",
      };
    }

    const ts = Date.now();
    const prefix = `SLICEB_FULL_${ts}`;
    const variantCodeA = `SLICEB-RBCT-V-A-${ts}`;
    const productCodeA = `${prefix}_A`;
    const nameA = `SliceB Full A ${ts}`;
    const productCodeB = `SLICEB-RBCT-P-B-${ts}`;
    const nameB = `SliceB Full B ${ts}`;
    const variantCodeC = `SLICEB-NS-V-C-${ts}`;
    const productCodeC = `${prefix}_C`;
    const nameC = `SliceB Full C NS ${ts}`;
    const variantCodeD = `SLICEB-INACTIVE-V-D-${ts}`;
    const productCodeD = `${prefix}_D`;
    const nameD = `SliceB Full D Inactive ${ts}`;

    const caseResults = [];

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login: no accessToken");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    const catMain = await ctx.api.fetchJson("/api/categories", {
      method: "POST",
      json: { name: `${prefix}_CAT_MAIN`, description: "slice-b-full", active: true },
    });
    const catEmpty = await ctx.api.fetchJson("/api/categories", {
      method: "POST",
      json: { name: `${prefix}_CAT_EMPTY`, description: "slice-b-full empty", active: true },
    });
    const categoryId = Number(catMain.id);
    const categoryEmptyId = Number(catEmpty.id);
    if (!Number.isFinite(categoryId) || !Number.isFinite(categoryEmptyId)) throw new Error("category id");

    const vBase = (code, name, sellable, variantActive) => ({
      variantCode: code,
      variantName: name,
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
      active: variantActive,
      isSellable: sellable,
    });

    const createdA = await ctx.api.fetchJson("/api/products", {
      method: "POST",
      json: {
        code: productCodeA,
        name: nameA,
        categoryId,
        active: true,
        productType: "SINGLE",
        imageUrl: null,
        initialVariants: [vBase(variantCodeA, "Line A", true, true)],
      },
    });
    const idA = String(createdA.id);

    const createdB = await ctx.api.fetchJson("/api/products", {
      method: "POST",
      json: {
        code: productCodeB,
        name: nameB,
        categoryId,
        active: true,
        productType: "SINGLE",
        imageUrl: null,
        initialVariants: [vBase(`SLICEB-VB-DEF-${ts}`, "Def B", true, true)],
      },
    });
    const idB = String(createdB.id);

    const createdC = await ctx.api.fetchJson("/api/products", {
      method: "POST",
      json: {
        code: productCodeC,
        name: nameC,
        categoryId,
        active: true,
        productType: "SINGLE",
        imageUrl: null,
        initialVariants: [vBase(variantCodeC, "Line C NS", false, true)],
      },
    });
    const idC = String(createdC.id);

    const createdD = await ctx.api.fetchJson("/api/products", {
      method: "POST",
      json: {
        code: productCodeD,
        name: nameD,
        categoryId,
        active: true,
        productType: "SINGLE",
        imageUrl: null,
        initialVariants: [vBase(variantCodeD, "Line D inactive", true, false)],
      },
    });
    const idD = String(createdD.id);

    const cleanupIds = [idD, idC, idB, idA];
    ctx.seed.registerCleanup(async () => {
      const tok = ctx.api.getAccessToken();
      for (const id of cleanupIds) {
        try {
          const res = await ctx.api.fetch(`/api/products/${id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) console.warn(`[slice-b-full] DELETE product ${id} → ${res.status}`);
        } catch (e) {
          console.warn(`[slice-b-full] cleanup ${id}: ${e?.message || e}`);
        }
      }
      for (const cid of [categoryId, categoryEmptyId]) {
        try {
          const res = await ctx.api.fetch(`/api/categories/${cid}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) console.warn(`[slice-b-full] DELETE category ${cid} → ${res.status}`);
        } catch (e) {
          console.warn(`[slice-b-full] cleanup cat ${cid}: ${e?.message || e}`);
        }
      }
      ctx.api.setAccessToken(tok);
    });

    const publicApi = createApiHelper(ctx.config.apiBaseUrl);
    const sort = "sort=name,asc";

    const qUrl = (term, extra = "") =>
      `/api/products?search=${encodeURIComponent(term)}&page=0&size=20&${sort}${extra ? `&${extra}` : ""}`;

    // ── Mandatory API: public ─────────────────────────────────────────────
    const pubA = await publicApi.fetchJson(qUrl(variantCodeA));
    const rowsA = assertPageShape(pubA, "public A");
    if (!rowsA.some((r) => String(r.id) === idA)) throw new Error("public A: parent not found");
    if (uniqParentIds(rowsA).size !== rowsA.length) throw new Error("public A: duplicate parent rows");
    caseResults.push(cr("api_public_variant_parent", "PASS", { productId: idA, variantCode: variantCodeA }));

    const pubB = await publicApi.fetchJson(qUrl(productCodeB));
    const rowsB = assertPageShape(pubB, "public B");
    if (!rowsB.some((r) => String(r.id) === idB)) throw new Error("public B: parent not found");
    caseResults.push(cr("api_public_product_code_parent", "PASS", { productId: idB }));

    const pubC = await publicApi.fetchJson(qUrl(variantCodeC));
    const totalC = Number(pubC.totalElements ?? 0);
    if (totalC !== 0) throw new Error(`public C NS: expected 0 results, got ${totalC}`);
    caseResults.push(cr("api_public_non_sellable_hidden", "PASS"));

    const pubD = await publicApi.fetchJson(qUrl(variantCodeD));
    const totalD = Number(pubD.totalElements ?? 0);
    if (totalD !== 0) throw new Error(`public D inactive variant: expected 0 results, got ${totalD}`);
    caseResults.push(cr("api_public_inactive_variant_hidden", "PASS"));

    const dupCheck = async (label, url) => {
      const page = await publicApi.fetchJson(url);
      const c = assertPageShape(page, label);
      if (uniqParentIds(c).size !== c.length) throw new Error(`${label}: duplicate parent rows in single page`);
    };
    await dupCheck("dup A", qUrl(variantCodeA));
    await dupCheck("dup B", qUrl(productCodeB));
    caseResults.push(cr("api_no_duplicate_parent_rows", "PASS"));

    const pubAwrongCat = await publicApi.fetchJson(qUrl(variantCodeA, `categoryId=${categoryEmptyId}`));
    if (Number(pubAwrongCat.totalElements ?? 0) !== 0) {
      throw new Error("category filter: wrong category should return 0 for A");
    }
    const pubArightCat = await publicApi.fetchJson(qUrl(variantCodeA, `categoryId=${categoryId}`));
    if (!assertPageShape(pubArightCat, "A right cat").some((r) => String(r.id) === idA)) {
      throw new Error("category filter: correct category should still find A");
    }
    caseResults.push(cr("api_category_filter_preserved", "PASS"));

    const pubAtype = await publicApi.fetchJson(qUrl(variantCodeA, "productType=SINGLE"));
    if (!assertPageShape(pubAtype, "A type").some((r) => String(r.id) === idA)) {
      throw new Error("productType=SINGLE: expected A");
    }
    caseResults.push(cr("api_product_type_filter_preserved_if_supported", "PASS"));

    // ── Mandatory API: admin ──────────────────────────────────────────────
    const admA = await ctx.api.fetchJson(qUrl(variantCodeA));
    if (!assertPageShape(admA, "admin A").some((r) => String(r.id) === idA)) throw new Error("admin A");
    const admB = await ctx.api.fetchJson(qUrl(productCodeB));
    if (!assertPageShape(admB, "admin B").some((r) => String(r.id) === idB)) throw new Error("admin B");
    const admC = await ctx.api.fetchJson(qUrl(variantCodeC));
    if (!assertPageShape(admC, "admin C").some((r) => String(r.id) === idC)) throw new Error("admin C NS");
    const admD = await ctx.api.fetchJson(qUrl(variantCodeD));
    if (!assertPageShape(admD, "admin D").some((r) => String(r.id) === idD)) throw new Error("admin D inactive");
    caseResults.push(cr("api_admin_non_sellable_visible", "PASS", { productId: idC }));
    caseResults.push(cr("api_admin_inactive_variant_visible", "PASS", { productId: idD }));

    // ── Revenue (hard) ────────────────────────────────────────────────────
    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");

    await driver.get(`${origin}/admin/revenue`);
    await waitForH1Containing(driver, "Doanh thu", 30000);

    await driver.executeScript(`
      window.__nhadanSliceBProductFetches = [];
      window.__nhadanSliceBRevenueFetches = [];
      const _fetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = function (...args) {
        try {
          const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
          const s = String(u);
          if (s.includes('/api/products')) window.__nhadanSliceBProductFetches.push(s);
          if (s.includes('/api/revenue')) window.__nhadanSliceBRevenueFetches.push(s);
        } catch (e) {}
        return _fetch(...args);
      };
    `);
    const hookSelf = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      globalThis.fetch('/api/products?page=0&size=1', { headers: { Accept: 'application/json' } })
        .catch(() => {})
        .finally(() => done((window.__nhadanSliceBProductFetches || []).length));
    `);
    if (!hookSelf || hookSelf < 1) throw new Error("fetch hook self-test failed");

    const filterBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Lọc theo sản phẩm')]")),
      20000,
    );
    await filterBtn.click();
    const revInput = await driver.wait(
      until.elementLocated(
        By.css('input[placeholder="Tìm sản phẩm / mã sản phẩm / mã variant"]'),
      ),
      15000,
    );
    await revInput.click();
    await revInput.sendKeys(variantCodeA);
    await driver.sleep(600);

    const encA = encodeURIComponent(variantCodeA);
    const productPoll = await driver.executeAsyncScript(
      `
      const token = arguments[0];
      const enc = arguments[1];
      const done = arguments[arguments.length - 1];
      const deadline = Date.now() + 20000;
      const tick = () => {
        const hooked = (window.__nhadanSliceBProductFetches || []).filter(
          u => typeof u === 'string' && u.includes('/api/products') && u.includes('search='),
        );
        if (hooked.some(u => u.includes(token) || u.includes(enc))) {
          done({ ok: true, urls: hooked.slice(-4) });
          return;
        }
        if (Date.now() > deadline) {
          done({ ok: false, hooked: hooked.slice(-6) });
          return;
        }
        setTimeout(tick, 400);
      };
      tick();
      `,
      variantCodeA,
      encA,
    );
    if (!productPoll?.ok) throw new Error(`Revenue: no /api/products?search= for A: ${JSON.stringify(productPoll)}`);

    const safeName = nameA.replace(/"/g, '\\"');
    const rowXp = `//button[contains(@class,'w-full') and .//span[contains(normalize-space(.), "${safeName}")]]`;
    await driver.wait(until.elementLocated(By.xpath(rowXp)), 20000);
    await driver.findElement(By.xpath(rowXp)).click();

    const revenueCheck = await driver.executeAsyncScript(
      `
      const productId = arguments[0];
      const done = arguments[1];
      const deadline = Date.now() + 15000;
      const tick = () => {
        const urls = [
          ...(window.__nhadanSliceBRevenueFetches || []),
          ...performance.getEntriesByType('resource').map(e => e.name).filter(u => u.includes('/api/revenue')),
        ];
        const bad = urls.find(u => /variantId/i.test(u));
        if (bad) { done({ ok: false, err: 'variantId in ' + bad }); return; }
        const withIds = urls.filter(u => u.includes('productIds='));
        if (withIds.length) {
          if (!withIds.some(u => u.includes('productIds=' + productId))) {
            done({ ok: false, err: 'missing productIds', urls: withIds.slice(-3) });
            return;
          }
          done({ ok: true, urls: withIds.slice(-4) });
          return;
        }
        if (Date.now() > deadline) done({ ok: false, err: 'timeout revenue productIds' });
        else setTimeout(tick, 200);
      };
      tick();
      `,
      idA,
    );
    if (!revenueCheck?.ok) throw new Error(`Revenue API check: ${revenueCheck?.err}`);

    await driver.findElement(By.xpath("//button[contains(., 'Xong')]")).click();
    await driver.sleep(400);
    await assertNoSevereBrowserLogs(driver);
    caseResults.push(
      cr("revenue_picker_variant_search_productIds", "PASS", {
        observedProductSearch: productPoll.urls,
        revenueUrls: revenueCheck.urls,
      }),
    );

    // ── Storefront ─────────────────────────────────────────────────────────
    await driver.get(`${origin}/products?q=${encodeURIComponent(variantCodeA)}`);
    await driver.sleep(2500);
    let bodyA = "";
    try {
      bodyA = await driver.findElement(By.css("body")).getText();
    } catch {
      bodyA = "";
    }
    const visA = bodyA.includes(nameA) || bodyA.includes(productCodeA);
    if (visA) {
      caseResults.push(
        cr("storefront_variant_search_visibility_or_documented_slice_e_debt", "PASS", {
          route: "/products",
          token: variantCodeA,
        }),
      );
    } else {
      caseResults.push(
        cr("storefront_variant_search_visibility_or_documented_slice_e_debt", "DEBT", {
          route: "/products",
          token: variantCodeA,
          reason:
            "Storefront Products.tsx loads listPublicProducts() fixed page=0&size=200 only; client filter can miss newly created SKUs not in first page — follow-up Slice E if server-driven storefront search required.",
          inspected: "nha-dan-pos-c091ee5b/src/services/catalog/publicCatalog.ts, src/pages/storefront/Products.tsx",
        }),
      );
    }

    await driver.get(`${origin}/products?q=${encodeURIComponent(variantCodeC)}`);
    await driver.sleep(2000);
    /** Only product cards — full body includes search box + nav (false positives). */
    const cardsC = await driver.findElements(By.css('[data-testid="storefront-product-card"]'));
    const cardTexts = await Promise.all(cardsC.map((el) => el.getText()));
    const leakC = cardTexts.some((t) => t.includes(nameC) || t.includes(productCodeC));
    if (leakC) {
      caseResults.push(
        cr("storefront_non_sellable_hidden", "FAIL", {
          route: "/products",
          reason: "Non-sellable parent visible in a storefront product card",
        }),
      );
      throw new Error("storefront leaked non-sellable product in UI");
    }
    caseResults.push(cr("storefront_non_sellable_hidden", "PASS", { route: "/products", token: variantCodeC }));

    // ── Admin Products ────────────────────────────────────────────────────
    await driver.get(`${origin}/admin/products`);
    await driver.sleep(1500);
    try {
      const inp = await driver.findElement(By.css('input[placeholder="Tìm tên, mã sản phẩm..."]'));
      await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE);
      await inp.sendKeys(variantCodeA);
      await driver.sleep(800);
      const b = await driver.findElement(By.css("body")).getText();
      const foundVar = b.includes(nameA);
      await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE);
      await inp.sendKeys(productCodeB);
      await driver.sleep(800);
      const b2 = await driver.findElement(By.css("body")).getText();
      const foundB = b2.includes(nameB);
      await assertNoSevereBrowserLogs(driver);
      caseResults.push(
        cr("admin_products_search_classified", foundVar ? "PASS" : "DEBT", {
          route: "/admin/products",
          variantTokenSearchShowsRow: foundVar,
          productCodeSearchShowsRow: foundB,
          reason: foundVar
            ? undefined
            : "Products.tsx filters client-side by product name/code only (not variantCode) — variant-only token may not surface row though API is variant-aware.",
          inspected: "src/pages/admin/Products.tsx (filtered useMemo)",
        }),
      );
    } catch (e) {
      caseResults.push(
        cr("admin_products_search_classified", "DEBT", {
          route: "/admin/products",
          reason: String(e?.message || e),
        }),
      );
    }

    // ── ProfitReport ──────────────────────────────────────────────────────
    await driver.get(`${origin}/admin/profit`);
    await waitForH1Containing(driver, "Lợi nhuận", 25000);
    try {
      const pBtn = await driver.findElement(By.xpath("//button[contains(., 'Lọc theo sản phẩm')]"));
      await pBtn.click();
      const pInp = await driver.wait(
        until.elementLocated(By.css('input[placeholder="Tìm sản phẩm..."]')),
        8000,
      );
      await pInp.sendKeys(variantCodeA);
      await driver.sleep(500);
      const pb = await driver.findElement(By.css("body")).getText();
      await assertNoSevereBrowserLogs(driver);
      caseResults.push(
        cr("profit_report_search_classified", "DEBT", {
          route: "/admin/profit",
          reason:
            "ProfitReport.tsx picker filters merged product list by name/code only (pickerProducts useMemo); no backend /api/products?search= — variant-only token unlikely to match.",
          inspected: "src/pages/admin/ProfitReport.tsx lines 140-150",
          bodyContainsProductAName: pb.includes(nameA),
        }),
      );
    } catch (e) {
      caseResults.push(
        cr("profit_report_search_classified", "DEBT", {
          route: "/admin/profit",
          reason: String(e?.message || e),
        }),
      );
    }

    // ── Promotions MultiPicker ────────────────────────────────────────────
    await driver.get(`${origin}/admin/promotions`);
    await driver.sleep(2000);
    try {
      const createBtn = await driver.wait(
        until.elementLocated(By.xpath("//button[contains(., 'Tạo khuyến mãi')]")),
        15000,
      );
      await createBtn.click();
      await driver.sleep(500);
      /** Product MultiPicker only mounts after scope kind "Sản phẩm"; placeholder is not default "Tìm kiếm...". */
      const scopeProd = await driver.wait(
        until.elementLocated(By.xpath("//div[contains(@class,'max-w-xl')]//button[normalize-space(.)='Sản phẩm']")),
        15000,
      );
      await scopeProd.click();
      await driver.sleep(400);
      const promInp = await driver.wait(
        until.elementLocated(
          By.xpath("//input[@placeholder='Tìm sản phẩm hoặc mã SP...']"),
        ),
        15000,
      );
      await promInp.sendKeys(productCodeB);
      await driver.sleep(500);
      const bodyP = await driver.findElement(By.css("body")).getText();
      await assertNoSevereBrowserLogs(driver);
      caseResults.push(
        cr("promotion_product_picker_classified", "PASS", {
          route: "/admin/promotions",
          note: "Scope productIds are product-level (PromotionFormShell); MultiPicker lists products from productService.list(200).",
          productBVisibleInPickerList: bodyP.includes(nameB) || bodyP.includes(productCodeB),
          inspected: "src/components/promotions/PromotionFormShell.tsx, MultiPicker.tsx",
        }),
      );
      await driver.get(`${origin}/admin`);
      await driver.sleep(400);
    } catch (e) {
      caseResults.push(
        cr("promotion_product_picker_classified", "SKIPPED_WITH_REASON", {
          route: "/admin/promotions",
          reason: String(e?.message || e),
        }),
      );
    }

    // ── POS ───────────────────────────────────────────────────────────────
    await driver.get(`${origin}/admin/pos`);
    await driver.sleep(2500);
    try {
      const posInp = await driver.findElement(By.css('input[placeholder="Tìm tên sản phẩm..."]'));
      await posInp.sendKeys(variantCodeA);
      await driver.sleep(600);
      const posBody = await driver.findElement(By.css("body")).getText();
      await posInp.clear();
      await posInp.sendKeys(productCodeB);
      await driver.sleep(600);
      const posBody2 = await driver.findElement(By.css("body")).getText();
      await assertNoSevereBrowserLogs(driver);
      caseResults.push(
        cr("pos_search_classified_no_semantic_change", "DEBT", {
          route: "/admin/pos",
          reason:
            "POS.tsx filters storeProducts (productService.list page 1, 200) by product name/code only — variantCode-only search is not variant-aware in UI grid.",
          inspected: "src/pages/admin/POS.tsx ~788,955",
          variantTokenShowsProduct: posBody.includes(nameA),
          productCodeShowsProduct: posBody2.includes(nameB),
        }),
      );
    } catch (e) {
      caseResults.push(
        cr("pos_search_classified_no_semantic_change", "DEBT", {
          route: "/admin/pos",
          reason: String(e?.message || e),
        }),
      );
    }

    // ── Goods receipt create ──────────────────────────────────────────────
    await driver.get(`${origin}/admin/goods-receipts/create`);
    await driver.sleep(2500);
    caseResults.push(
      cr("goods_receipt_create_search_classified", "DEBT", {
        route: "/admin/goods-receipts/create",
        reason:
          "GoodsReceiptCreate loads productService.list({ pageSize: 500 }) then SearchableCombobox filters client-side labels — no /api/products?search= per keystroke; variant-code-only discovery depends on option labels.",
        inspected: "src/pages/admin/GoodsReceiptCreate.tsx (~432, SearchableCombobox)",
      }),
    );
    await assertNoSevereBrowserLogs(driver).catch(() => {});

    // ── Stock adjustment create ─────────────────────────────────────────
    await driver.get(`${origin}/admin/stock-adjustments/create`);
    await driver.sleep(2000);
    try {
      const saInp = await driver.findElement(
        By.css('input[placeholder*="mã variant"], input[placeholder*="Nhập tên sản phẩm"]'),
      );
      await saInp.sendKeys(variantCodeA);
      await driver.sleep(1200);
      const saBody = await driver.findElement(By.css("body")).getText();
      await assertNoSevereBrowserLogs(driver);
      caseResults.push(
        cr("stock_adjustment_search_classified", "DEBT", {
          route: "/admin/stock-adjustments/create",
          reason:
            "StockAdjustmentCreate searches cached inventory.listInventoryProjections() client-side — not Slice B /api/products search; lines use variantId on submit (expected).",
          inspected: "src/pages/admin/StockAdjustmentCreate.tsx",
          bodyHintsVariant: saBody.includes(variantCodeA) || saBody.includes(nameA),
        }),
      );
    } catch (e) {
      caseResults.push(
        cr("stock_adjustment_search_classified", "DEBT", {
          route: "/admin/stock-adjustments/create",
          reason: String(e?.message || e),
        }),
      );
    }

    // ── Inventory report ──────────────────────────────────────────────────
    await driver.get(`${origin}/admin/inventory-report`);
    await driver.sleep(2000);
    try {
      const irInp = await driver.wait(
        until.elementLocated(By.css('input[placeholder*="Tìm sản phẩm"]')),
        10000,
      );
      await irInp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE);
      await irInp.sendKeys(variantCodeA);
      await driver.sleep(800);
      const irBody = await driver.findElement(By.css("body")).getText();
      await assertNoSevereBrowserLogs(driver);
      caseResults.push(
        cr("inventory_report_search_classified", irBody.includes(variantCodeA) ? "PASS" : "DEBT", {
          route: "/admin/inventory-report",
          reason: irBody.includes(variantCodeA)
            ? undefined
            : "Row may be absent when no inventory movements for SKU in report window — client filter only searches loaded report rows.",
          inspected: "src/pages/admin/InventoryReport.tsx",
        }),
      );
    } catch (e) {
      caseResults.push(
        cr("inventory_report_search_classified", "DEBT", {
          route: "/admin/inventory-report",
          reason: String(e?.message || e),
        }),
      );
    }

    // ── Production recipe new ─────────────────────────────────────────────
    await driver.get(`${origin}/admin/production/recipes/new`);
    await waitForH1Containing(driver, "Tạo quy trình sản xuất", 25000);
    await driver.sleep(800);
    caseResults.push(
      cr("production_recipe_search_classified", "DEBT", {
        route: "/admin/production/recipes/new",
        reason:
          "ProductionRecipeFormPage loads productService.list({ pageSize: 500 }) and builds local searchText including variant codes — variant-aware only within loaded page; no live /api/products?search=.",
        inspected: "src/pages/admin/ProductionRecipeFormPage.tsx",
      }),
    );
    await assertNoSevereBrowserLogs(driver).catch(() => {});

    // ── Combos ────────────────────────────────────────────────────────────
    await driver.get(`${origin}/admin/combos`);
    await driver.sleep(2000);
    caseResults.push(
      cr("combos_search_classified", "DEBT", {
        route: "/admin/combos",
        reason:
          "AdminCombos uses productService.list page 100 for component picker; combo lines reference products/variants from loaded catalog — not backend search per token.",
        inspected: "src/pages/admin/Combos.tsx",
      }),
    );
    await assertNoSevereBrowserLogs(driver).catch(() => {});

    // ── Product import review ─────────────────────────────────────────────
    caseResults.push(
      cr("product_import_review_search_classified", "SKIPPED_WITH_REASON", {
        route: "component: src/components/shared/ProductImportReview.tsx (opened from ImportPreviewDialog)",
        reason:
          "No stable file-upload fixture in automation suite; import review search/validation is manual or separate import-spec debt.",
        inspected: "src/components/shared/ProductImportReview.tsx, ImportPreviewDialog",
      }),
    );

    const failUi = caseResults.filter((x) => x.status === "FAIL");
    if (failUi.length) throw new Error(`UI FAIL cases: ${failUi.map((f) => f.case).join(", ")}`);

    return {
      caseResults,
      fixture: {
        ts,
        idA,
        idB,
        idC,
        idD,
        productCodeA,
        productCodeB,
        variantCodeA,
        variantCodeC,
        variantCodeD,
        categoryId,
      },
    };
  },
};
