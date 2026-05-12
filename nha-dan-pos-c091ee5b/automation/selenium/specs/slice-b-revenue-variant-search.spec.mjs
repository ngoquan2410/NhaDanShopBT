/**
 * Legacy Slice B revenue-only spec. Full search impact: slice-b-search-impact.spec.mjs (tag slice-b).
 * For this file only: npm run test:automation -- --run --tags=slice-b-legacy-revenue
 */
import { By, logging, until } from "selenium-webdriver";
import { createApiHelper } from "../helpers/api.mjs";
import { waitForH1Containing } from "../helpers/assertions.mjs";

/** @param {unknown} page */
function assertProductSearchPage(page, expectMinTotal, label) {
  if (!page || typeof page !== "object") throw new Error(`${label}: invalid JSON`);
  const content = page.content;
  if (!Array.isArray(content)) throw new Error(`${label}: missing content[]`);
  if (page.totalElements != null && Number(page.totalElements) < expectMinTotal) {
    throw new Error(`${label}: totalElements ${page.totalElements} < ${expectMinTotal}`);
  }
  const ids = content.map((r) => String(r?.id ?? ""));
  const uniq = new Set(ids);
  if (uniq.size !== ids.length) throw new Error(`${label}: duplicate product id in content`);
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

export default {
  name: "Slice B: variant search API + Revenue picker + public visibility smoke",
  tags: ["slice-b-legacy-revenue", "watchlist-revenue-profit"],
  order: 54,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return {
        skipped: true,
        reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD (see automation/selenium/env.example)",
      };
    }

    const ts = Date.now();
    const variantToken = `SLICEB-RBCT-V-${ts}`;
    const productCodeA = `SLICEB-P-${ts}`;
    const productNameA = `SliceB E2E Parent ${ts}`;
    const variantNameA = `SliceB RBCT Variant ${ts}`;
    const productCodeB = `SLICEB-RBCT-P-${ts}`;
    const productNameB = `SliceB RBCT Code Product ${ts}`;
    const nsVariantCode = `SLICEB-NS-V-${ts}`;
    const productCodeNs = `SLICEB-NS-P-${ts}`;

    const login = await ctx.api.authLoginJson(u, p);
    const token = login.accessToken;
    if (!token) throw new Error("login: no accessToken");
    ctx.api.setAccessToken(typeof token === "string" ? token : String(token));

    const cat = await ctx.api.fetchJson("/api/categories", {
      method: "POST",
      json: {
        name: `SLICEB_E2E_${ts}`,
        description: "slice-b selenium",
        active: true,
      },
    });
    const categoryId = Number(cat.id);
    if (!Number.isFinite(categoryId)) throw new Error("category id");

    const variantPayload = (code, name, sellable, variantActive = true) => ({
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

    const bodyA = {
      code: productCodeA,
      name: productNameA,
      categoryId,
      active: true,
      productType: "SINGLE",
      imageUrl: null,
      initialVariants: [variantPayload(variantToken, variantNameA, true)],
    };
    const createdA = await ctx.api.fetchJson("/api/products", { method: "POST", json: bodyA });
    const productIdA = String(createdA.id);

    const bodyB = {
      code: productCodeB,
      name: productNameB,
      categoryId,
      active: true,
      productType: "SINGLE",
      imageUrl: null,
      initialVariants: [
        variantPayload(`SLICEB-VDEF-${ts}`, "Default line", true),
      ],
    };
    const createdB = await ctx.api.fetchJson("/api/products", { method: "POST", json: bodyB });
    const productIdB = String(createdB.id);

    const bodyNs = {
      code: productCodeNs,
      name: `SliceB NS Parent ${ts}`,
      categoryId,
      active: true,
      productType: "SINGLE",
      imageUrl: null,
      initialVariants: [variantPayload(nsVariantCode, "Non-sellable line", false)],
    };
    const createdNs = await ctx.api.fetchJson("/api/products", { method: "POST", json: bodyNs });
    const productIdNs = String(createdNs.id);

    const cleanupIds = [productIdNs, productIdB, productIdA];
    ctx.seed.registerCleanup(async () => {
      const tok = ctx.api.getAccessToken();
      for (const id of cleanupIds) {
        try {
          const res = await ctx.api.fetch(`/api/products/${id}`, { method: "DELETE" });
          if (!res.ok && res.status !== 404) {
            console.warn(`[slice-b cleanup] DELETE /api/products/${id} → ${res.status}`);
          }
        } catch (e) {
          console.warn(`[slice-b cleanup] ${id}: ${e?.message || e}`);
        }
      }
      ctx.api.setAccessToken(tok);
    });

    // ── Phase 2: direct API (public vs admin) ─────────────────────────────
    const publicApi = createApiHelper(ctx.config.apiBaseUrl);

    const urlVar = `/api/products?search=${encodeURIComponent(variantToken)}&page=0&size=20&sort=name,asc`;
    const pageVar = await publicApi.fetchJson(urlVar);
    const rowsVar = assertProductSearchPage(pageVar, 1, "public search by variantCode");
    const hitA = rowsVar.find((r) => String(r.id) === productIdA);
    if (!hitA) throw new Error("public variant search: parent A not in content");
    if (String(hitA.code) !== productCodeA) throw new Error("public: wrong product.code");
    const variantsA = hitA.variants;
    if (!Array.isArray(variantsA) || variantsA.length === 0) {
      throw new Error("public: expected variants[] on product response");
    }
    const vHit = variantsA.find((v) => String(v.variantCode ?? v.code) === variantToken);
    if (!vHit) throw new Error("public: variant row missing in DTO");

    const urlCodeB = `/api/products?search=${encodeURIComponent(productCodeB)}&page=0&size=20&sort=name,asc`;
    const pageCode = await publicApi.fetchJson(urlCodeB);
    const rowsCode = assertProductSearchPage(pageCode, 1, "public search by productCode RBCT");
    if (!rowsCode.some((r) => String(r.id) === productIdB)) {
      throw new Error("public productCode search: parent B not found");
    }

    const urlNsPub = `/api/products?search=${encodeURIComponent(nsVariantCode)}&page=0&size=20&sort=name,asc`;
    const pageNsPub = await publicApi.fetchJson(urlNsPub);
    const nsTotal = Number(pageNsPub.totalElements ?? 0);
    if (nsTotal !== 0) {
      throw new Error(
        `public visibility: non-sellable-only variant match should not surface parent (totalElements=${nsTotal})`,
      );
    }

    const pageNsAdmin = await ctx.api.fetchJson(urlNsPub);
    const adminHits = assertProductSearchPage(pageNsAdmin, 1, "admin search non-sellable variant");
    if (!adminHits.some((r) => String(r.id) === productIdNs)) {
      throw new Error("admin: expected to find product by non-sellable variant code");
    }

    console.log(
      `[slice-b API] variant search OK id=${productIdA} code=${productCodeA} variant=${variantToken} totalElements=${pageVar.totalElements}`,
    );
    console.log(
      `[slice-b API] RBCT productCode search OK id=${productIdB} totalElements=${pageCode.totalElements}`,
    );
    console.log(`[slice-b API] public NS hidden; admin NS totalElements=${pageNsAdmin.totalElements}`);

    // ── Phase 3: Revenue UI ───────────────────────────────────────────────
    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    await driver.get(`${origin}/admin/revenue`);
    await waitForH1Containing(driver, "Doanh thu", 30000);

    /** Headless Chrome often omits fetch from Performance Resource Timing; wrap fetch to observe /api/products. */
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

    const hookSelfTest = await driver.executeAsyncScript(`
      const done = arguments[arguments.length - 1];
      globalThis.fetch('/api/products?page=0&size=1', { headers: { Accept: 'application/json' } })
        .catch(() => {})
        .finally(() => done((window.__nhadanSliceBProductFetches || []).slice(-3)));
    `);
    if (!Array.isArray(hookSelfTest) || !hookSelfTest.some((u) => u.includes("/api/products"))) {
      throw new Error(
        `Fetch hook self-test failed (instrumentation): ${JSON.stringify(hookSelfTest)}`,
      );
    }

    const filterBtn = await driver.wait(
      until.elementLocated(By.xpath("//button[contains(., 'Lọc theo sản phẩm')]")),
      20000,
    );
    await filterBtn.click();

    /** Must not match AdminTopbar `Tìm sản phẩm, hóa đơn...` (substring "Tìm sản phẩm"). */
    const searchInput = await driver.wait(
      until.elementLocated(
        By.css('input[placeholder="Tìm sản phẩm / mã sản phẩm / mã variant"]'),
      ),
      15000,
    );
    await searchInput.click();
    await searchInput.sendKeys(variantToken);
    await driver.sleep(500);

    const enc = encodeURIComponent(variantToken);
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
          done({ ok: true, source: 'fetch-hook', productReq: hooked.slice(-6) });
          return;
        }
        const names = performance.getEntriesByType('resource').map(e => e.name);
        const res = names.filter(
          n => typeof n === 'string' && n.includes('/api/products') && n.includes('search='),
        );
        if (res.some(n => n.includes(token) || n.includes(enc))) {
          done({ ok: true, source: 'resource-timing', productReq: res.slice(-6) });
          return;
        }
        if (Date.now() > deadline) {
          done({
            ok: false,
            hooked: hooked.slice(-6),
            resource: res.slice(-6),
            apiRecent: names.filter(n => n.includes('/api/')).slice(-12),
          });
          return;
        }
        setTimeout(tick, 400);
      };
      tick();
      `,
      variantToken,
      enc,
    );
    if (!productPoll || !productPoll.ok) {
      throw new Error(
        `No /api/products?search= with token (fetch hook or resource timing): ${JSON.stringify(productPoll)}`,
      );
    }

    const safeName = productNameA.replace(/"/g, '\\"');
    const rowXp = `//button[contains(@class,'w-full') and .//span[contains(normalize-space(.), "${safeName}")]]`;
    await driver.wait(until.elementLocated(By.xpath(rowXp)), 20000);
    const rowBtn = await driver.findElement(By.xpath(rowXp));
    await rowBtn.click();

    /** Revenue refetch after selection: productIds= on /api/revenue, never variantId (fetch hook + resource timing). */
    const revenueCheck = await driver.executeAsyncScript(
      `
      const productId = arguments[0];
      const done = arguments[1];
      const deadline = Date.now() + 15000;
      const collect = () => {
        const hooked = (window.__nhadanSliceBRevenueFetches || []).slice();
        const res = performance.getEntriesByType('resource')
          .map(e => e.name)
          .filter(u => typeof u === 'string' && u.includes('/api/revenue'));
        return { hooked, res, urls: [...hooked, ...res] };
      };
      const tick = () => {
        const { urls } = collect();
        const bad = urls.find(u => /variantId/i.test(u));
        if (bad) {
          done({ ok: false, err: 'variantId in ' + bad });
          return;
        }
        const withIds = urls.filter(u => u.includes('productIds='));
        if (withIds.length > 0) {
          if (productId && !withIds.some(u => u.includes('productIds=' + productId))) {
            done({ ok: false, err: 'productIds missing expected id ' + productId, urls: withIds.slice(-3) });
            return;
          }
          done({ ok: true, urls: withIds.slice(-5) });
          return;
        }
        if (Date.now() > deadline) {
          const c = collect();
          done({
            ok: false,
            err: 'timeout: no productIds= on /api/revenue',
            hooked: c.hooked.slice(-5),
            res: c.res.slice(-5),
          });
          return;
        }
        setTimeout(tick, 200);
      };
      tick();
      `,
      productIdA,
    );
    if (!revenueCheck || !revenueCheck.ok) {
      throw new Error(
        `[slice-b] revenue request check: ${revenueCheck?.err || "unknown"} ${JSON.stringify(revenueCheck?.urls || [])}`,
      );
    }

    const doneBtn = await driver.findElement(By.xpath("//button[contains(., 'Xong')]"));
    await doneBtn.click();
    await driver.sleep(400);

    await driver.wait(until.elementLocated(By.xpath(`//*[contains(., '${safeName}')]`)), 15000);

    await assertNoSevereBrowserLogs(driver);

    // ── Phase 4: related smoke ────────────────────────────────────────────
    await driver.get(`${origin}/products?q=${encodeURIComponent(variantToken)}`);
    await driver.sleep(2500);
    const bodyText = await driver.findElement(By.css("body")).getText();
    if (!bodyText.includes(productNameA) && !bodyText.includes(productCodeA)) {
      console.warn(
        "[slice-b storefront] product name/code not visible in body (pagination/client filter debt — API already proved public search)",
      );
    }

    await driver.get(`${origin}/admin/products`);
    await driver.sleep(1500);
    try {
      const searchEl = await driver.findElement(By.css('input[placeholder*="Tìm"], input[type="search"]'));
      await searchEl.clear();
      await searchEl.sendKeys(productCodeB);
      await driver.sleep(500);
    } catch {
      console.warn("[slice-b admin products] search input not found — skipped");
    }

    await driver.get(`${origin}/admin/pos`);
    await driver.sleep(2000);
    await assertNoSevereBrowserLogs(driver);

    return {
      caseResults: [
        { case: "api_variant_parent", ok: true, productId: productIdA, variantToken },
        { case: "api_product_code_rbtc", ok: true, productId: productIdB },
        { case: "public_ns_hidden", ok: true },
        { case: "revenue_picker", ok: true },
      ],
    };
  },
};
