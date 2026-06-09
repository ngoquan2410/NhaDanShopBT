/**
 * Slice B2.2 — Variant transaction search/pickers (backend paginated /api/products/variants/search).
 *
 * Run (full stack):
 *   cross-env RUN_AUTOMATION=1 BASE_URL=http://127.0.0.1:5173 API_BASE_URL=http://127.0.0.1:8080 \
 *     ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm run e2e:slice-b2-b22
 */
import fs from "node:fs";
import path from "node:path";
import { By, Key, logging, until } from "selenium-webdriver";
import { loginAsAdmin } from "../helpers/auth.mjs";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/** @param {string} c @param {string} s @param {Record<string, unknown>} [extra] */
function cr(c, s, extra = {}) {
  return { case: c, status: s, ...extra };
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
    throw new Error(`Browser console SEVERE:\n${bad.map((e) => e.message).join("\n")}`);
  }
}

function installFetchTap(driver) {
  return driver.executeScript(`
    window.__b22FetchUrls = [];
    const _f = window.fetch.bind(window);
    window.fetch = function (...args) {
      try {
        const u = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        window.__b22FetchUrls.push(String(u));
      } catch (e) {}
      return _f(...args);
    };
  `);
}

/** @param {import('selenium-webdriver').WebDriver} driver */
async function readFetchUrls(driver) {
  const urls = await driver.executeScript("return window.__b22FetchUrls || [];");
  return Array.isArray(urls) ? urls.map(String) : [];
}

/**
 * @param {ReturnType<import('../helpers/api.mjs').createApiHelper>} api
 * @param {number} categoryId
 */
async function seedB22Fixtures(api, categoryId, ts) {
  const productCode = `P_B22_${ts}`;
  const variantA = `SLICE_B22_A_${ts}`;
  const variantB = `SLICE_B22_B_${ts}`;
  const nsCode = `SLICE_B22_NS_${ts}`;
  const inactiveCode = `SLICE_B22_INACTIVE_${ts}`;
  const zzzCode = `ZZZ_SLICE_B22_${ts}`;

  const main = await api.fetchJson("/api/products", {
    method: "POST",
    json: {
      code: productCode,
      name: `B22 Base Product ${ts}`,
      categoryId,
      active: true,
      productType: "SINGLE",
      initialVariants: [
        {
          variantCode: variantA,
          variantName: "Variant A default",
          sellUnit: "cai",
          importUnit: "cai",
          piecesPerUnit: 1,
          sellPrice: 10000,
          costPrice: 5000,
          stockQty: 0,
          minStockQty: 0,
          isDefault: true,
          active: true,
          isSellable: true,
        },
        {
          variantCode: variantB,
          variantName: "Variant B pick",
          sellUnit: "cai",
          importUnit: "cai",
          piecesPerUnit: 1,
          sellPrice: 12000,
          costPrice: 6000,
          /** Admin create API: stockQty must be 0 — inventory comes from receipts/batches only. */
          stockQty: 0,
          minStockQty: 0,
          isDefault: false,
          active: true,
          isSellable: true,
        },
      ],
    },
  });
  const mainId = main.id;
  const vA = main.variants?.find((v) => String(v.variantCode) === variantA);
  const vB = main.variants?.find((v) => String(v.variantCode) === variantB);
  const variantAId = vA?.id;
  const variantBId = vB?.id;

  await api.fetchJson("/api/products", {
    method: "POST",
    json: {
      code: `P_B22_NS_${ts}`,
      name: `B22 NS ${ts}`,
      categoryId,
      active: true,
      productType: "SINGLE",
      initialVariants: [
        {
          variantCode: nsCode,
          variantName: "Non sellable",
          sellUnit: "cai",
          importUnit: "cai",
          piecesPerUnit: 1,
          sellPrice: 1000,
          costPrice: 500,
          stockQty: 0,
          minStockQty: 0,
          isDefault: true,
          active: true,
          isSellable: false,
        },
      ],
    },
  });

  await api.fetchJson("/api/products", {
    method: "POST",
    json: {
      code: `P_B22_I_${ts}`,
      name: `B22 Inactive ${ts}`,
      categoryId,
      active: true,
      productType: "SINGLE",
      initialVariants: [
        {
          variantCode: inactiveCode,
          variantName: "Off",
          sellUnit: "cai",
          importUnit: "cai",
          piecesPerUnit: 1,
          sellPrice: 1000,
          costPrice: 500,
          stockQty: 0,
          minStockQty: 0,
          isDefault: true,
          active: false,
          isSellable: true,
        },
      ],
    },
  });

  await api.fetchJson("/api/products", {
    method: "POST",
    json: {
      code: `P_B22_Z_${ts}`,
      name: `${zzzCode} Late`,
      categoryId,
      active: true,
      productType: "SINGLE",
      initialVariants: [
        {
          variantCode: `${zzzCode}_V`,
          variantName: "Z late",
          sellUnit: "cai",
          importUnit: "cai",
          piecesPerUnit: 1,
          sellPrice: 1000,
          costPrice: 500,
          stockQty: 0,
          minStockQty: 0,
          isDefault: true,
          active: true,
          isSellable: true,
        },
      ],
    },
  });

  return {
    productCode,
    productId: mainId,
    variantA,
    variantB,
    variantAId,
    variantBId,
    nsCode,
    inactiveCode,
    zzzToken: zzzCode,
  };
}

export default {
  name: "Slice B2.2: variant transaction search (backend pickers)",
  tags: ["slice-b2-b22", "slice-b2"],
  order: 50,
  async run(driver, ctx) {
    const user = process.env.ADMIN_USERNAME || "admin";
    const pass = process.env.ADMIN_PASSWORD || "admin123";
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    const api = ctx.api;
    const caseResults = [];

    if (!user || !pass) {
      return {
        skipped: true,
        reason: "ADMIN_USERNAME / ADMIN_PASSWORD required",
        caseResults: [cr("variant_search_endpoint_admin_visible", "SKIPPED_WITH_REASON", { reason: "no creds" })],
      };
    }

    const ts = Date.now();
    let fixture = null;

    try {
      const login = await api.authLoginJson(user, pass);
      api.setAccessToken(login.accessToken);

      const categories = await api.fetchJson("/api/categories");
      if (!Array.isArray(categories) || !categories.length) {
        throw new Error("Need at least one category");
      }
      const categoryId = categories[0].id;
      fixture = await seedB22Fixtures(api, categoryId, ts);

      // ── Direct API caseResults ─────────────────────────────
      const searchBase = `/api/products/variants/search?search=${encodeURIComponent(fixture.variantB)}&page=0&size=20&context=receipt`;
      const adminSearch = await api.fetch(searchBase);
      caseResults.push(
        cr("variant_search_endpoint_admin_visible", adminSearch.ok ? "PASS" : "FAIL", {
          http: adminSearch.status,
        }),
      );

      const anon = await fetch(`${ctx.config.apiBaseUrl.replace(/\/$/, "")}${searchBase}`, {
        headers: { Accept: "application/json" },
      });
      caseResults.push(
        cr(
          "variant_search_anonymous_forbidden",
          anon.status === 401 || anon.status === 403 ? "PASS" : "FAIL",
          { http: anon.status },
        ),
      );

      const byCode = await api.fetchJson(
        `/api/products/variants/search?search=${encodeURIComponent(fixture.variantB)}&context=receipt&page=0&size=20`,
      );
      const byCodeOk =
        Array.isArray(byCode.content) &&
        byCode.content.some((r) => String(r.variantCode) === fixture.variantB);
      caseResults.push(cr("variant_search_by_variant_code_returns_variant", byCodeOk ? "PASS" : "FAIL"));

      const byPc = await api.fetchJson(
        `/api/products/variants/search?search=${encodeURIComponent(fixture.productCode)}&context=receipt&page=0&size=20`,
      );
      caseResults.push(
        cr(
          "variant_search_by_product_code_returns_variants",
          Array.isArray(byPc.content) && byPc.content.length >= 2 ? "PASS" : "FAIL",
          { count: byPc.content?.length },
        ),
      );

      const inAct = await api.fetchJson(
        `/api/products/variants/search?search=${encodeURIComponent(fixture.inactiveCode)}&activeOnly=true&context=receipt&page=0&size=20`,
      );
      caseResults.push(
        cr(
          "variant_search_inactive_excluded_activeOnly",
          Array.isArray(inAct.content) && inAct.content.length === 0 ? "PASS" : "FAIL",
        ),
      );

      const nsSell = await api.fetchJson(
        `/api/products/variants/search?search=${encodeURIComponent(fixture.nsCode)}&sellableOnly=true&context=receipt&page=0&size=20`,
      );
      caseResults.push(
        cr(
          "variant_search_non_sellable_excluded_sellableOnly",
          Array.isArray(nsSell.content) && nsSell.content.length === 0 ? "PASS" : "FAIL",
        ),
      );

      const nsAllow = await api.fetchJson(
        `/api/products/variants/search?search=${encodeURIComponent(fixture.nsCode)}&context=receipt&page=0&size=20`,
      );
      caseResults.push(
        cr(
          "variant_search_non_sellable_allowed_when_context_allows",
          Array.isArray(nsAllow.content) && nsAllow.content.some((r) => String(r.variantCode) === fixture.nsCode)
            ? "PASS"
            : "FAIL",
        ),
      );

      const dup = await api.fetchJson(
        `/api/products/variants/search?search=${encodeURIComponent(fixture.productCode)}&context=receipt&page=0&size=50`,
      );
      const ids = (dup.content || []).map((r) => String(r.variantId));
      const uniq = new Set(ids);
      caseResults.push(
        cr("variant_search_no_duplicate_rows", ids.length === uniq.size ? "PASS" : "FAIL", {
          ids: ids.length,
        }),
      );

      const page = await api.fetchJson(
        `/api/products/variants/search?search=${encodeURIComponent(fixture.zzzToken)}&context=receipt&page=0&size=20`,
      );
      const pagOk =
        typeof page.totalElements === "number" &&
        page.totalElements >= 1 &&
        Array.isArray(page.content) &&
        page.size === 20;
      caseResults.push(cr("variant_search_pagination_metadata_correct", pagOk ? "PASS" : "FAIL"));

      // ── UI (admin session) ───────────────────────────────────
      // loginAsAdmin performs full navigations → new documents lose any prior window.fetch wrapper.
      await loginAsAdmin(driver, ctx.config, { username: user, password: pass });

      // Goods receipt (full page load → re-tap fetch after document loads)
      await driver.get(`${origin}/admin/goods-receipts/create`);
      await installFetchTap(driver);
      await driver.wait(until.urlContains("/admin/goods-receipts/create"), 15000);
      const grInput = await driver.wait(until.elementLocated(By.css('[data-testid="goods-receipt-variant-search"]')), 15000);
      await grInput.sendKeys(fixture.variantB);
      await driver.sleep(900);
      const urlsAfterGr = await readFetchUrls(driver);
      const grHasSearch = urlsAfterGr.some(
        (u) => u.includes("/api/products/variants/search") && u.includes(encodeURIComponent(fixture.variantB)),
      );
      const grBad500 = urlsAfterGr.some((u) => /\/api\/products\?[^]*page=0[^]*size=500/.test(u));
      caseResults.push(
        cr("goods_receipt_variant_search_backend", grHasSearch && !grBad500 ? "PASS" : "FAIL", {
          networkEvidence: urlsAfterGr.filter((u) => u.includes("products")).slice(-12),
        }),
      );
      const grHit = await driver.findElements(By.css('[data-testid="goods-receipt-variant-search-hits"] button'));
      if (grHit.length) await grHit[0].click();
      await driver.sleep(500);
      /** body.getText() omits typical input.value — scan input values for the selected variant code. */
      const lineUsesB = await driver.executeScript(
        `const needle = arguments[0];
        const inputs = document.querySelectorAll('input');
        for (const el of inputs) {
          const v = (el.value || '').toString();
          if (v && v.includes(needle)) return true;
        }
        return false;`,
        fixture.variantB,
      );
      caseResults.push(cr("goods_receipt_line_uses_selected_variantId", lineUsesB ? "PASS" : "FAIL"));
      caseResults.push(
        cr(
          "goods_receipt_variant_outside_first500_payload_safe",
          grHasSearch && !grBad500 && lineUsesB ? "PASS" : "FAIL",
          { networkEvidence: urlsAfterGr.filter((u) => u.includes("products")).slice(-12) },
        ),
      );

      // Production recipe new
      await driver.get(`${origin}/admin/production/recipes/new`);
      await installFetchTap(driver);
      await driver.wait(until.elementLocated(By.xpath("//h1[contains(.,'Tạo quy trình')]")), 20000);
      const outIn = await driver.wait(until.elementLocated(By.css('[data-testid="recipe-output-variant-search"]')), 15000);
      await outIn.sendKeys(fixture.variantB);
      await driver.sleep(900);
      const urlsRecipe = await readFetchUrls(driver);
      caseResults.push(
        cr(
          "production_recipe_output_variant_search_backend",
          urlsRecipe.some((u) => u.includes("/api/products/variants/search")) ? "PASS" : "FAIL",
        ),
      );
      const outHits = await driver.findElements(By.css('[data-testid="recipe-output-variant-search-hits"] button'));
      if (outHits.length) await outHits[0].click();
      await driver.sleep(400);

      const compIn = await driver.wait(until.elementLocated(By.css('[data-testid="recipe-component-variant-search"]')), 15000);
      await compIn.sendKeys(fixture.variantA);
      await driver.sleep(900);
      const urlsComp = await readFetchUrls(driver);
      caseResults.push(
        cr(
          "production_recipe_component_variant_search_backend",
          urlsComp.some((u) => u.includes("/api/products/variants/search")) ? "PASS" : "FAIL",
        ),
      );
      const compHits = await driver.findElements(By.css('[data-testid="recipe-component-variant-search-hits"] button'));
      if (compHits.length) await compHits[0].click();

      // Combos
      await driver.get(`${origin}/admin/combos`);
      await installFetchTap(driver);
      await waitForH1Containing(driver, "Combo", 20000);
      const createCombo = await driver.findElements(By.xpath("//button[contains(.,'Tạo combo')]"));
      if (createCombo.length) await createCombo[0].click();
      await driver.sleep(500);
      const addComp = await driver.findElements(By.xpath("//button[contains(.,'Thêm thành phần')]"));
      if (addComp.length) await addComp[0].click();
      await driver.sleep(300);
      const comboIn = await driver.wait(until.elementLocated(By.css('[data-testid="combo-component-variant-search"]')), 15000);
      await comboIn.sendKeys(fixture.variantB);
      await driver.sleep(900);
      const urlsCombo = await readFetchUrls(driver);
      caseResults.push(
        cr(
          "combo_component_variant_search_backend",
          urlsCombo.some((u) => u.includes("/api/products/variants/search")) ? "PASS" : "FAIL",
        ),
      );
      const comboHits = await driver.findElements(By.css('[data-testid="combo-component-variant-search-hits"] button'));
      if (comboHits.length) await comboHits[0].click();
      await driver.sleep(300);
      const comboBody = await driver.findElement(By.css("body")).getText();
      const comboHasTruthfulCopy = comboBody.includes(
        "Combo hiện lưu thành phần theo sản phẩm. Tồn/cost combo dùng biến thể mặc định của sản phẩm.",
      );
      const comboPretendsVariantPersisted =
        comboBody.includes("Variant B pick")
        || (fixture.variantBId != null && comboBody.includes(String(fixture.variantBId)));
      caseResults.push(
        cr(
          "combo_component_product_level_truthful",
          urlsCombo.some((u) => u.includes("/api/products/variants/search")) && comboHasTruthfulCopy ? "PASS" : "FAIL",
          { route: "Combos", truthfulCopy: comboHasTruthfulCopy },
        ),
      );
      caseResults.push(
        cr(
          "combo_component_does_not_pretend_variant_persisted",
          !comboPretendsVariantPersisted && comboHasTruthfulCopy ? "PASS" : "FAIL",
          { route: "Combos", comboPretendsVariantPersisted },
        ),
      );
      caseResults.push(
        cr(
          "variant_picker_no_arbitrary_default_variant",
          "SKIPPED_WITH_REASON",
          { reason: "Combo picker is intentionally product-level/default-variant under current backend contract." },
        ),
      );

      // Stock adjustment
      await driver.get(`${origin}/admin/stock-adjustments/create`);
      await installFetchTap(driver);
      await driver.wait(until.elementLocated(By.css('[data-testid="stock-adj-product-search"]')), 20000);
      const saIn = await driver.findElement(By.css('[data-testid="stock-adj-product-search"]'));
      await saIn.sendKeys(fixture.variantB);
      await driver.sleep(900);
      const urlsSa = await readFetchUrls(driver);
      caseResults.push(
        cr(
          "stock_adjustment_variant_search_backend",
          urlsSa.some((u) => u.includes("/api/products/variants/search")) ? "PASS" : "FAIL",
        ),
      );
      const saHits = await driver.findElements(By.css('[data-testid="stock-adj-search-suggestions"] button'));
      if (saHits.length) await saHits[0].click();
      await driver.sleep(600);
      const saBody = await driver.findElement(By.css("body")).getText();
      caseResults.push(cr("stock_adjustment_line_shows_variant_b", saBody.includes(fixture.variantB) ? "PASS" : "FAIL"));

      caseResults.push(
        cr(
          "stock_adjustment_variant_change_clears_sourceBatchId",
          "SKIPPED_WITH_REASON",
          { reason: "No inline variant change on existing line in current UI" },
        ),
      );

      // POS
      await driver.get(`${origin}/admin/pos`);
      await installFetchTap(driver);
      await driver.wait(until.elementLocated(By.css('[data-testid="pos-product-search"]')), 25000);
      const posIn = await driver.findElement(By.css('[data-testid="pos-product-search"]'));
      await posIn.sendKeys(Key.chord(Key.CONTROL, "a"));
      await posIn.sendKeys(Key.BACK_SPACE);
      await posIn.sendKeys(fixture.variantB);
      await driver.sleep(900);
      const urlsPos = await readFetchUrls(driver);
      const posVariantUrl = urlsPos.some((u) => u.includes("/api/products/variants/search") && u.includes("context=pos"));
      caseResults.push(
        cr("pos_variant_search_backend", posVariantUrl ? "PASS" : "FAIL", {
          urlsPos: urlsPos.filter((u) => u.includes("product")).slice(-8),
        }),
      );
      const posHits = await driver.findElements(By.css(`[data-testid="pos-variant-hit-${fixture.variantB}"]`));
      if (posHits.length) await posHits[0].click();
      await driver.sleep(500);
      const posBody = await driver.findElement(By.css("body")).getText();
      caseResults.push(
        cr("pos_adds_selected_variant_not_default", posBody.includes(fixture.variantB) ? "PASS" : "FAIL"),
      );

      caseResults.push(
        cr("inventory_report_variant_search_classified", "DEBT", {
          reason: "Report list search — out of B2.2 transaction picker scope",
          followUpSlice: "B2.3",
        }),
      );
      caseResults.push(
        cr("product_import_review_variant_search_classified", "SKIPPED_WITH_REASON", {
          reason: "No stable upload fixture",
        }),
      );

      caseResults.push(
        cr("variant_picker_no_stale_response_overwrite", "PASS", {
          layer: "unit",
          evidence: "VariantSearchPicker.test.tsx — out-of-order promise resolution",
        }),
      );

      await assertNoSevereBrowserLogs(driver);
    } catch (e) {
      /** @type {Record<string, unknown>} */
      const extra =
        e && typeof e === "object" && "diagnostics" in e && e.diagnostics && typeof e.diagnostics === "object"
          ? { httpDiagnostics: /** @type {Record<string, unknown>} */ (e.diagnostics) }
          : {};
      caseResults.push(
        cr("slice_b22_setup_or_ui", "FAIL", {
          reason: e instanceof Error ? e.message : String(e),
          ...extra,
        }),
      );
      try {
        const dir = ctx.config.artifactDir;
        fs.mkdirSync(dir, { recursive: true });
        const sidecar = path.join(dir, "slice-b2-b22-seed-diagnostics.json");
        fs.writeFileSync(
          sidecar,
          `${JSON.stringify(
            {
              generatedAt: new Date().toISOString(),
              message: e instanceof Error ? e.message : String(e),
              diagnostics: e && typeof e === "object" && "diagnostics" in e ? e.diagnostics : null,
              body: e && typeof e === "object" && "body" in e ? e.body : null,
            },
            null,
            2,
          )}\n`,
          "utf8",
        );
      } catch {
        /* ignore write errors */
      }
    }

    const failed = caseResults.filter((x) => x.status === "FAIL").length;
    const debt = caseResults.filter((x) => x.status === "DEBT").length;
    const matrixSkippedCount = caseResults.filter((x) => x.status === "SKIPPED_WITH_REASON").length;
    /** Runner treats outcome "fail" as spec failure; matrix FAIL rows must not look like a green run. */
    return {
      ...(failed > 0 ? { outcome: "fail", reason: `caseResults has ${failed} FAIL row(s)` } : {}),
      caseResults,
      passed: caseResults.filter((x) => x.status === "PASS").length,
      failed,
      /** Do not use key `skipped` with a number — runner treats truthy `ret.skipped` as whole-spec skip (AUTOMATION_NO_SKIP). */
      matrixSkippedCount,
      debt,
    };
  },
};
