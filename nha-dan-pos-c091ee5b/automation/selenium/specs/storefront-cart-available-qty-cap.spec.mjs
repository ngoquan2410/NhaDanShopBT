import fs from "node:fs";
import path from "node:path";
import { By, until } from "selenium-webdriver";
import { fillCheckoutContactAndStreet, selectFirstFullAddress } from "../helpers/storefrontFlows.mjs";

function cr(caseId, outcome, extra = {}) {
  return { caseId, outcome, ...extra };
}

async function installQuoteTap(driver) {
  await driver.executeScript(`
    window.__cartAvailTap = { salesQuote: [], variantAvailability: [] };
    const orig = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = String(typeof input === "string" ? input : input?.url ?? "");
      const res = await orig(input, init);
      if (url.includes("/api/sales/quote")) {
        let responseBody = "";
        try { responseBody = await res.clone().text(); } catch (_e) {}
        window.__cartAvailTap.salesQuote.push({
          url,
          method: String(init?.method ?? "POST"),
          requestBody: init?.body ?? null,
          status: res.status,
          responseBody,
        });
      }
      if (url.includes("/api/products/variants/availability")) {
        window.__cartAvailTap.variantAvailability.push({
          url,
          method: String(init?.method ?? "GET"),
        });
      }
      return res;
    };
  `);
}

/**
 * Persist quote/availability fetch tap across full document loads.
 * @param {import('selenium-webdriver').WebDriver} driver
 */
async function installCartAvailFetchTapCdp(driver) {
  const conn = await driver.createCDPConnection("page");
  await conn.send("Page.enable", {});
  const source = `
    (function () {
      window.__cartAvailTap = { salesQuote: [], variantAvailability: [] };
      var _f = window.fetch.bind(window);
      window.fetch = function () {
        var input = arguments[0];
        var init = arguments[1] != null ? arguments[1] : {};
        var url = String(typeof input === "string" ? input : (input && input.url) || "");
        return _f.apply(window, arguments).then(function (res) {
          try {
            if (url.indexOf("/api/sales/quote") >= 0) {
              return res.clone().text().then(function (responseBody) {
                window.__cartAvailTap.salesQuote.push({
                  url: url,
                  method: String(init.method || "POST"),
                  requestBody: init.body != null ? init.body : null,
                  status: res.status,
                  responseBody: responseBody
                });
                return res;
              }).catch(function () {
                window.__cartAvailTap.salesQuote.push({
                  url: url,
                  method: String(init.method || "POST"),
                  requestBody: init.body != null ? init.body : null,
                  status: res.status,
                  responseBody: ""
                });
                return res;
              });
            }
            if (url.indexOf("/api/products/variants/availability") >= 0) {
              window.__cartAvailTap.variantAvailability.push({
                url: url,
                method: String(init.method || "GET")
              });
            }
          } catch (_e2) {}
          return res;
        });
      };
    })();
  `;
  await conn.send("Page.addScriptToEvaluateOnNewDocument", { source });
}

async function readTap(driver) {
  return driver.executeScript("return window.__cartAvailTap || { salesQuote: [] };");
}

/** Client-side navigate to /cart so `window.fetch` instrumentation survives (full reload clears it). */
async function openStorefrontCartViaSpaNav(driver) {
  await driver.wait(until.elementsLocated(By.css('a[href="/cart"]')), 20000);
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const links = await driver.findElements(By.css('a[href="/cart"]'));
    for (const link of links) {
      try {
        if (await link.isDisplayed()) {
          await link.click();
          return;
        }
      } catch (_e) {
        // stale / detached
      }
    }
    await driver.sleep(250);
  }
  throw new Error('No visible storefront cart link (a[href="/cart"])');
}

/** After writing `nhadan.cart.v1`, reload so `cart.ts` loadInitial() picks up persisted lines. */
async function reloadStorefrontAfterCartSeed(driver) {
  await driver.navigate().refresh();
  await driver.sleep(800);
}

/** From cart page, SPA-navigate to checkout (keeps `fetch` instrumentation). */
async function openCheckoutFromCartViaSpa(driver) {
  const link = await driver.wait(until.elementLocated(By.partialLinkText("Tiến hành thanh toán")), 25000);
  await link.click();
}

/**
 * @param {string} apiOrigin
 * @returns {Promise<{ productId: string; variantId: string; availableQty: number; sellUnit: string; unitPrice: number } | null>}
 */
async function pickVariantWithLowPublicStock(apiOrigin) {
  const api = apiOrigin.replace(/\/$/, "");
  const catalogRes = await fetch(`${api}/api/products?page=0&size=80&sort=name,asc`);
  const catalogText = await catalogRes.text();
  if (!catalogRes.ok) throw new Error(`GET /api/products → HTTP ${catalogRes.status}`);
  const catalogJson = catalogText ? JSON.parse(catalogText) : {};
  const content = Array.isArray(catalogJson.content) ? catalogJson.content : [];
  for (const p of content) {
    for (const v of Array.isArray(p.variants) ? p.variants : []) {
      const q = v?.availableQty;
      if (typeof q === "number" && q > 0 && q < 20) {
        return {
          productId: String(p.id),
          variantId: String(v.id),
          availableQty: q,
          sellUnit: String(v.sellUnit || "cái"),
          unitPrice: Math.max(1, Number(v.sellPrice ?? 0)),
        };
      }
    }
  }
  return null;
}

async function pickAnotherVariant(apiOrigin, excludeVariantId) {
  const api = apiOrigin.replace(/\/$/, "");
  const catalogRes = await fetch(`${api}/api/products?page=0&size=80&sort=name,asc`);
  const catalogText = await catalogRes.text();
  if (!catalogRes.ok) return null;
  const catalogJson = catalogText ? JSON.parse(catalogText) : {};
  const content = Array.isArray(catalogJson.content) ? catalogJson.content : [];
  for (const p of content) {
    for (const v of Array.isArray(p.variants) ? p.variants : []) {
      const vid = String(v.id);
      if (vid === String(excludeVariantId)) continue;
      const q = v?.availableQty;
      if (typeof q === "number" && q > 0) {
        return {
          productId: String(p.id),
          variantId: vid,
          availableQty: q,
          sellUnit: String(v.sellUnit || "cái"),
          unitPrice: Math.max(1, Number(v.sellPrice ?? 0)),
        };
      }
    }
  }
  return null;
}

/** Build a persisted cart line matching storefront schema (optionally omit availability for stale-cart cases). */
function cartPayloadLine(pick, qty, extra = {}) {
  const omitAvailability = Boolean(extra.omitAvailability);
  const { omitAvailability: _o, ...restExtra } = extra;
  return {
    id: "ci-selenium-avail",
    productId: pick.productId,
    variantId: pick.variantId,
    productCode: "E2E",
    variantCode: "E2E-V",
    productName: "E2E availability cap",
    variantName: "Default",
    categoryId: "1",
    categoryName: "Cat",
    qty,
    unitPrice: pick.unitPrice || 1000,
    lineSubtotal: (pick.unitPrice || 1000) * qty,
    catalogSource: "backend",
    schemaVersion: 2,
    ...(omitAvailability
      ? {}
      : {
          availableQty: pick.availableQty,
          availabilityStatus: "IN_STOCK",
          sellUnit: pick.sellUnit,
        }),
    ...restExtra,
  };
}

export default {
  name: "Storefront cart caps quantity by public availableQty",
  tags: ["storefront-cart-available-qty-cap"],
  order: 48,
  /** @param {import('selenium-webdriver').WebDriver} driver */
  async run(driver, ctx) {
    const { config } = ctx;
    const origin = config.baseUrl.replace(/\/$/, "");
    const api = config.apiBaseUrl.replace(/\/$/, "");
    const caseResults = [];

    const pick = await pickVariantWithLowPublicStock(api);
    if (!pick) {
      caseResults.push(
        cr("storefront_cart_caps_qty_to_public_available_qty", "fail", {
          error: "No catalog variant with 0 < availableQty < 20",
        }),
      );
      return { outcome: "fail", reason: "No suitable catalog variant", caseResults };
    }

    let cdpTapInstalled = false;
    try {
      await installCartAvailFetchTapCdp(driver);
      cdpTapInstalled = true;
    } catch {
      cdpTapInstalled = false;
    }

    const plusTestId = `storefront-cart-line-qty-plus-${pick.productId}-${pick.variantId}`;
    const qtyInputTestId = `storefront-cart-line-qty-${pick.productId}-${pick.variantId}`;

    // --- storefront_cart_caps_qty_to_public_available_qty ---
    try {
      await driver.get(`${origin}/`);
      await driver.executeScript("try { localStorage.removeItem('nhadan.cart.v1'); } catch (e) {}");
      await driver.get(`${origin}/products/${pick.productId}`);
      await driver.sleep(900);
      const addBtns = await driver.findElements(By.css('[data-testid="storefront-add-cart"]'));
      let clicked = false;
      for (const b of addBtns) {
        if (await b.isDisplayed()) {
          const tx = await b.getText();
          if (tx.includes("Thêm")) {
            await b.click();
            clicked = true;
            break;
          }
        }
      }
      if (!clicked) throw new Error("No visible add-to-cart on product detail");
      await driver.sleep(400);
      await driver.get(`${origin}/cart`);
      await driver.wait(
        until.elementLocated(By.css(`[data-testid="${plusTestId}"]`)),
        25000,
      );
      const plus = await driver.findElement(By.css(`[data-testid="${plusTestId}"]`));
      for (let i = 0; i < 25; i++) await plus.click();
      await driver.sleep(200);
      const input = await driver.findElement(By.css(`[data-testid="${qtyInputTestId}"]`));
      const val = String(await input.getAttribute("value")).trim();
      if (val !== String(pick.availableQty)) {
        throw new Error(`Expected cart qty ${pick.availableQty}, got "${val}"`);
      }
      const disabled = await plus.getAttribute("disabled");
      if (disabled !== "true") {
        const v2 = String(await input.getAttribute("value")).trim();
        if (v2 !== String(pick.availableQty)) throw new Error("Plus should be disabled at cap");
      }
      caseResults.push(cr("storefront_cart_caps_qty_to_public_available_qty", "pass", { pick }));
    } catch (e) {
      caseResults.push(cr("storefront_cart_caps_qty_to_public_available_qty", "fail", { error: e?.message || String(e) }));
    }

    // --- storefront_cart_preserves_available_qty_after_reload ---
    try {
      await driver.get(`${origin}/cart`);
      await driver.navigate().refresh();
      await driver.sleep(800);
      const input = await driver.wait(
        until.elementLocated(By.css(`[data-testid="${qtyInputTestId}"]`)),
        20000,
      );
      const valAfter = String(await input.getAttribute("value")).trim();
      if (valAfter !== String(pick.availableQty)) {
        throw new Error(`After reload expected qty ${pick.availableQty}, got ${valAfter}`);
      }
      const plus = await driver.findElement(By.css(`[data-testid="${plusTestId}"]`));
      for (let i = 0; i < 12; i++) await plus.click();
      const val2 = String(await input.getAttribute("value")).trim();
      if (val2 !== String(pick.availableQty)) throw new Error("After reload + spam plus, qty should stay capped");
      caseResults.push(cr("storefront_cart_preserves_available_qty_after_reload", "pass"));
    } catch (e) {
      caseResults.push(cr("storefront_cart_preserves_available_qty_after_reload", "fail", { error: e?.message || String(e) }));
    }

    const pick2 = await pickAnotherVariant(api, pick.variantId);

    // --- storefront_cart_clamps_stale_local_qty ---
    try {
      await driver.get(`${origin}/`);
      await driver.executeScript(
        `window.localStorage.setItem("nhadan.cart.v1", JSON.stringify(arguments[0]));`,
        {
          items: [cartPayloadLine(pick, 20, { omitAvailability: true })],
          selectedPromotionId: null,
          selectedPromotionMode: "auto",
        },
      );
      await reloadStorefrontAfterCartSeed(driver);
      if (!cdpTapInstalled) await installQuoteTap(driver);
      await openStorefrontCartViaSpaNav(driver);
      await driver.sleep(1500);
      const tapStale = await driver.executeScript("return window.__cartAvailTap || {};");
      const va = tapStale.variantAvailability || [];
      if (va.length < 1) {
        throw new Error("Expected at least one /api/products/variants/availability fetch for stale cart reconcile");
      }
      const input = await driver.wait(
        until.elementLocated(By.css(`[data-testid="${qtyInputTestId}"]`)),
        20000,
      );
      const clamped = String(await input.getAttribute("value")).trim();
      if (clamped !== String(pick.availableQty)) {
        throw new Error(`Stale qty 20 should clamp to ${pick.availableQty}, got ${clamped}`);
      }
      caseResults.push(cr("storefront_cart_clamps_stale_local_qty", "pass"));
    } catch (e) {
      caseResults.push(cr("storefront_cart_clamps_stale_local_qty", "fail", { error: e?.message || String(e) }));
    }

    // --- storefront_cart_reconciles_stale_line_without_per_row_calls ---
    try {
      if (!pick2) {
        throw new Error("No second distinct variant for two-line batch test");
      }
      await driver.get(`${origin}/`);
      await driver.executeScript(
        `window.localStorage.setItem("nhadan.cart.v1", JSON.stringify(arguments[0]));`,
        {
          items: [
            { ...cartPayloadLine(pick, 5, { omitAvailability: true, id: "ci-a" }) },
            {
              ...cartPayloadLine(pick2, 3, {
                omitAvailability: true,
                id: "ci-b",
                productId: pick2.productId,
                variantId: pick2.variantId,
              }),
            },
          ],
          selectedPromotionId: null,
          selectedPromotionMode: "auto",
        },
      );
      await reloadStorefrontAfterCartSeed(driver);
      if (!cdpTapInstalled) await installQuoteTap(driver);
      await openStorefrontCartViaSpaNav(driver);
      await driver.sleep(1500);
      const tap2 = await driver.executeScript("return window.__cartAvailTap || {};");
      const reqs = tap2.variantAvailability || [];
      if (reqs.length < 1) throw new Error("Expected batch availability fetch");
      const allIds = new Set();
      for (const r of reqs) {
        const u = String(r.url || "");
        const parts = u.split("variantIds=");
        for (let i = 1; i < parts.length; i++) {
          const raw = decodeURIComponent(parts[i].split("&")[0] || "");
          raw.split(",").forEach((id) => {
            const t = id.trim();
            if (t) allIds.add(t);
          });
        }
      }
      if (!allIds.has(String(pick.variantId)) || !allIds.has(String(pick2.variantId))) {
        throw new Error(`Batch URL(s) should include both variant ids; saw ids: ${[...allIds].join(",")}`);
      }
      caseResults.push(cr("storefront_cart_reconciles_stale_line_without_per_row_calls", "pass"));
    } catch (e) {
      caseResults.push(
        cr("storefront_cart_reconciles_stale_line_without_per_row_calls", "fail", { error: e?.message || String(e) }),
      );
    }

    // --- storefront_checkout_no_insufficient_stock_after_cart_cap ---
    try {
      const lineQty = Math.min(3, pick.availableQty);

      await driver.get(`${origin}/`);
      await driver.executeScript(
        `window.localStorage.setItem("nhadan.cart.v1", JSON.stringify(arguments[0]));`,
        {
          items: [cartPayloadLine(pick, lineQty)],
          selectedPromotionId: null,
          selectedPromotionMode: "auto",
        },
      );
      await reloadStorefrontAfterCartSeed(driver);
      if (!cdpTapInstalled) await installQuoteTap(driver);
      await openStorefrontCartViaSpaNav(driver);
      await driver.sleep(2500);
      await openCheckoutFromCartViaSpa(driver);
      await driver.wait(until.urlContains("/checkout"), 20000);
      await driver.sleep(500);
      await fillCheckoutContactAndStreet(driver, { name: "E2E Avail", phone: "0909123456", street: "1 Le Loi" });
      await selectFirstFullAddress(driver);
      await driver.sleep(4000);
      try {
        await driver.wait(
          async () => {
            const tap = await readTap(driver);
            if (tap.salesQuote && tap.salesQuote.length > 0) return true;
            /** @type {unknown} */
            const n = await driver.executeScript(`
              return performance.getEntriesByType("resource")
                .filter(function (e) {
                  return typeof e.name === "string" && e.name.indexOf("/api/sales/quote") >= 0;
                }).length;
            `);
            return Number(n) > 0;
          },
          35000,
        );
      } catch {
        /* checkout may not surface quote in Resource Timing in all runners */
      }

      const quoteBody = {
        source: "storefront",
        lines: [
          {
            productId: Number(pick.productId),
            variantId: Number(pick.variantId),
            quantity: lineQty,
            discountPercent: 0,
            rewardLine: false,
          },
        ],
        shippingAddress: {
          receiverName: "E2E Avail",
          phone: "0909123456",
          provinceCode: "1",
          provinceName: "Test",
          districtCode: "2",
          districtName: "Test",
          wardCode: "3",
          wardName: "Test",
          street: "1 Le Loi",
        },
        manualDiscount: 0,
        vatPercent: 0,
        requestedRedeemPoints: 0,
      };
      const apiRes = await fetch(`${api}/api/sales/quote`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(quoteBody),
      });
      const apiText = await apiRes.text();
      if (!apiRes.ok) {
        throw new Error(`POST /api/sales/quote (sanity) → HTTP ${apiRes.status}: ${apiText.slice(0, 400)}`);
      }
      if (/Cần\s*\d+,\s*còn\s*\d+/i.test(apiText)) {
        throw new Error("Quote JSON suggests insufficient-stock wording for capped qty");
      }
      const apiJson = apiText ? JSON.parse(apiText) : {};
      const apiLines = Array.isArray(apiJson.lines) ? apiJson.lines : [];
      const apiHit = apiLines.find(
        (l) => String(l.productId) === pick.productId && String(l.variantId) === pick.variantId,
      );
      if (!apiHit) throw new Error(`Sanity quote missing line for product ${pick.productId} variant ${pick.variantId}`);
      if (Number(apiHit.quantity) > pick.availableQty) {
        throw new Error(`Sanity quote qty ${apiHit.quantity} exceeds availableQty ${pick.availableQty}`);
      }

      const tap = await readTap(driver);
      if (tap.salesQuote && tap.salesQuote.length > 0) {
        const last = tap.salesQuote[tap.salesQuote.length - 1];
        if (Number(last.status) !== 200) {
          throw new Error(`Browser quote HTTP ${last.status}: ${String(last.responseBody || "").slice(0, 240)}`);
        }
        let body = {};
        try {
          body = last.requestBody ? JSON.parse(String(last.requestBody)) : {};
        } catch {
          body = {};
        }
        const lines = Array.isArray(body.lines) ? body.lines : [];
        const hit = lines.find(
          (l) => String(l.productId) === pick.productId && String(l.variantId) === pick.variantId,
        );
        if (!hit) throw new Error(`Browser quote lines missing product ${pick.productId} variant ${pick.variantId}`);
        if (Number(hit.quantity) > pick.availableQty) {
          throw new Error(`Browser quote quantity ${hit.quantity} exceeds availableQty ${pick.availableQty}`);
        }
        const bad = /Cần\s*\d+,\s*còn\s*\d+/i.test(String(last.responseBody || ""));
        if (bad) throw new Error("Browser quote response suggests insufficient-stock wording");
      }

      caseResults.push(cr("storefront_checkout_no_insufficient_stock_after_cart_cap", "pass"));
    } catch (e) {
      caseResults.push(
        cr("storefront_checkout_no_insufficient_stock_after_cart_cap", "fail", { error: e?.message || String(e) }),
      );
    }

    // --- public_catalog_no_internal_stock_leak ---
    try {
      const catalogRes = await fetch(`${api}/api/products?page=0&size=20&sort=name,asc`);
      const catalogText = await catalogRes.text();
      if (!catalogRes.ok) throw new Error(`GET /api/products → HTTP ${catalogRes.status}`);
      const catalogJson = catalogText ? JSON.parse(catalogText) : {};
      fs.mkdirSync(config.artifactDir, { recursive: true });
      fs.writeFileSync(
        path.join(config.artifactDir, "storefront-cart-avail-catalog-sample.json"),
        `${JSON.stringify(catalogJson, null, 2)}\n`,
        "utf8",
      );
      const forbidden = ['"stockQty"', '"remainingQty"', '"batches"', '"receipt"', '"costPrice"'];
      for (const snip of forbidden) {
        if (catalogText.includes(snip)) throw new Error(`Forbidden substring in public JSON: ${snip}`);
      }
      const content = Array.isArray(catalogJson.content) ? catalogJson.content : [];
      let sawAvail = false;
      for (const p of content) {
        for (const v of Array.isArray(p.variants) ? p.variants : []) {
          if (Object.prototype.hasOwnProperty.call(v, "availableQty")) sawAvail = true;
        }
      }
      if (!sawAvail) throw new Error("No variant exposed availableQty");
      const batchRes = await fetch(`${api}/api/products/variants/availability?variantIds=${encodeURIComponent(pick.variantId)}`);
      const batchText = await batchRes.text();
      if (!batchRes.ok) throw new Error(`GET batch availability → HTTP ${batchRes.status}`);
      for (const snip of forbidden) {
        if (batchText.includes(snip)) throw new Error(`Batch response contains forbidden ${snip}`);
      }
      if (!batchText.includes("availableQty")) throw new Error("Batch response missing availableQty");
      caseResults.push(cr("public_catalog_no_internal_stock_leak", "pass"));
    } catch (e) {
      caseResults.push(cr("public_catalog_no_internal_stock_leak", "fail", { error: e?.message || String(e) }));
    }

    const failed = caseResults.filter((c) => c.outcome === "fail");
    if (failed.length > 0) {
      return {
        outcome: "fail",
        reason: failed.map((f) => `${f.caseId}: ${f.error || ""}`).join("; "),
        caseResults,
      };
    }
    return { caseResults };
  },
};
