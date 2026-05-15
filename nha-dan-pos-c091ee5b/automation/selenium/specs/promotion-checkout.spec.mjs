import { By, until } from "selenium-webdriver";
import { dumpPromoFailureContext } from "../helpers/promotionCheckout.mjs";
import { fillCheckoutContactAndStreet, selectFirstFullAddress } from "../helpers/storefrontFlows.mjs";
import { ensureCategory, ensureProduct, loginAdminApi, postReceipt, uniq } from "../helpers/e2eFixtures.mjs";

const CASES = Array.from({ length: 17 }, (_, i) => `PROMO-${String(i + 1).padStart(2, "0")}`);

function nowLocalDateTime(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 19);
}

async function installNetworkTap(driver) {
  await driver.executeScript(`
    (() => {
      if (window.__promoTapInstalled) return;
      window.__promoTapInstalled = true;
      window.__promoTap = { salesQuote: [], pickBest: [] };
      const pushTap = (entry) => {
        if (entry.url.includes("/api/sales/quote")) window.__promoTap.salesQuote.push(entry);
        if (entry.url.includes("/api/promotions/pick-best")) window.__promoTap.pickBest.push(entry);
      };
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init = {}) => {
        const url = String(typeof input === "string" ? input : input?.url ?? "");
        const reqBody = init?.body ?? null;
        const started = Date.now();
        const res = await originalFetch(input, init);
        let bodyText = "";
        try { bodyText = await res.clone().text(); } catch (_e) {}
        const payload = { url, method: String(init?.method ?? "GET"), requestBody: reqBody, status: res.status, responseBody: bodyText, started, ended: Date.now() };
        pushTap(payload);
        return res;
      };
      const XHR = window.XMLHttpRequest;
      const open = XHR.prototype.open;
      const send = XHR.prototype.send;
      XHR.prototype.open = function(method, url, ...rest) {
        this.__promoTapMeta = { method: String(method || "GET"), url: String(url || ""), requestBody: null, started: 0 };
        return open.call(this, method, url, ...rest);
      };
      XHR.prototype.send = function(body) {
        if (this.__promoTapMeta) {
          this.__promoTapMeta.requestBody = body ?? null;
          this.__promoTapMeta.started = Date.now();
        }
        this.addEventListener("loadend", function() {
          const meta = this.__promoTapMeta || {};
          const entry = {
            url: String(meta.url || ""),
            method: String(meta.method || "GET"),
            requestBody: meta.requestBody ?? null,
            status: Number(this.status || 0),
            responseBody: String(this.responseText || ""),
            started: Number(meta.started || Date.now()),
            ended: Date.now(),
          };
          pushTap(entry);
        });
        return send.call(this, body);
      };
    })();
  `);
}

async function readNetworkTap(driver) {
  return await driver.executeScript("return window.__promoTap || { salesQuote: [], pickBest: [] };");
}

async function getNodeText(driver, selector) {
  return await driver.executeScript(
    "const el = document.querySelector(arguments[0]); return el ? (el.textContent || '').trim() : '';",
    selector,
  );
}

async function waitPromotionEvaluationLoaded(driver) {
  await driver.wait(async () => {
    const status = await driver.executeScript(`
      const el = document.querySelector('[data-testid="cart-promo-eval-status"]');
      return el ? (el.textContent || "").trim() : "";
    `);
    return status === "loaded";
  }, 30000);
}

async function setCart(driver, origin, line) {
  await driver.get(`${origin}/`);
  await driver.executeScript(
    `window.localStorage.setItem("nhadan.cart.v1", JSON.stringify(arguments[0]));`,
    {
      items: [line],
      selectedPromotionId: null,
      selectedPromotionMode: "auto",
    },
  );
}

async function createPromotion(api, payload) {
  return await api.fetchJson("/api/promotions", { method: "POST", json: payload });
}

export default {
  name: "Promotion checkout regression matrix PROMO-01..17 (business-critical real cases)",
  tags: ["promotion-checkout"],
  order: 60,
  async run(driver, ctx) {
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    const caseResults = CASES.map((id) => ({ caseId: id, outcome: "skipped", reason: "not in current regression slice" }));
    const failDumps = [];

    const adminUser = ctx.config.adminUsername || "admin";
    const adminPass = ctx.config.adminPassword || "admin123";
    await loginAdminApi(ctx.api, adminUser, adminPass);

    const categoryId = await ensureCategory(ctx.api, `E2E Promo ${uniq("cat")}`);
    const code = `E2E-PROMO-${Date.now().toString(36).toUpperCase()}`;
    const variantCode = `${code}-V`;
    const product = await ensureProduct(ctx.api, categoryId, code, variantCode, { sellPrice: 120000, costPrice: 60000 });
    const receipt = await postReceipt(ctx.api, {
      productId: product.productId,
      variantId: product.variantId,
      qty: 50,
      unitCost: 60000,
      expiry: new Date(Date.now() + 86400000 * 60).toISOString().slice(0, 10),
      supplierName: "E2E Promo Supplier",
      note: "promotion-checkout",
    });
    if (!receipt?.id) {
      throw new Error("Could not seed stock receipt for promotion e2e");
    }

    const promoA = await createPromotion(ctx.api, {
      name: `PROMO13-A-${Date.now()}`,
      description: "PROMO-13 manual chosen lower than best",
      type: "PERCENT_DISCOUNT",
      discountValue: 5,
      minOrderValue: 50000,
      maxDiscount: 1000000,
      startDate: nowLocalDateTime(-1),
      endDate: nowLocalDateTime(10),
      active: true,
      appliesTo: "ALL",
      minOrderScope: "WHOLE_ORDER",
      buyQty: null, getProductId: null, getQty: null, minBuyQty: null, maxBuyQty: null, buyItems: null, repeatable: true, maxGiftApplications: null,
      categoryIds: [], productIds: [],
    });
    const promoB = await createPromotion(ctx.api, {
      name: `PROMO13-B-${Date.now()}`,
      description: "PROMO-13 best promo",
      type: "PERCENT_DISCOUNT",
      discountValue: 15,
      minOrderValue: 50000,
      maxDiscount: 1000000,
      startDate: nowLocalDateTime(-1),
      endDate: nowLocalDateTime(10),
      active: true,
      appliesTo: "ALL",
      minOrderScope: "WHOLE_ORDER",
      buyQty: null, getProductId: null, getQty: null, minBuyQty: null, maxBuyQty: null, buyItems: null, repeatable: true, maxGiftApplications: null,
      categoryIds: [], productIds: [],
    });
    const freeShip = await createPromotion(ctx.api, {
      name: `PROMO14-FS-${Date.now()}`,
      description: "PROMO-14 manual free shipping",
      type: "FREE_SHIPPING",
      discountValue: 0,
      minOrderValue: 50000,
      maxDiscount: 20000,
      startDate: nowLocalDateTime(-1),
      endDate: nowLocalDateTime(10),
      active: true,
      appliesTo: "ALL",
      minOrderScope: "WHOLE_ORDER",
      buyQty: null, getProductId: null, getQty: null, minBuyQty: null, maxBuyQty: null, buyItems: null, repeatable: true, maxGiftApplications: null,
      categoryIds: [], productIds: [],
    });
    const fixedPromo = await createPromotion(ctx.api, {
      name: `PROMO16-FIXED-${Date.now()}`,
      description: "PROMO-16 manual fixed preview before address",
      type: "FIXED_DISCOUNT",
      discountValue: 7000,
      minOrderValue: 50000,
      maxDiscount: 0,
      startDate: nowLocalDateTime(-1),
      endDate: nowLocalDateTime(10),
      active: true,
      appliesTo: "ALL",
      minOrderScope: "WHOLE_ORDER",
      buyQty: null, getProductId: null, getQty: null, minBuyQty: null, maxBuyQty: null, buyItems: null, repeatable: true, maxGiftApplications: null,
      categoryIds: [], productIds: [],
    });
    const quantityGiftPromo = await createPromotion(ctx.api, {
      name: `PROMO15-QGIFT-${Date.now()}`,
      description: "PROMO-15 manual QUANTITY_GIFT preview before address",
      type: "QUANTITY_GIFT",
      discountValue: 0,
      minOrderValue: 0,
      maxDiscount: 0,
      startDate: nowLocalDateTime(-1),
      endDate: nowLocalDateTime(10),
      active: true,
      appliesTo: "PRODUCT",
      minOrderScope: "WHOLE_ORDER",
      buyQty: 1,
      getProductId: product.productId,
      getQty: 1,
      minBuyQty: null,
      maxBuyQty: null,
      buyItems: [{ productId: product.productId, buyQty: 1, sortOrder: 0 }],
      repeatable: true,
      maxGiftApplications: null,
      categoryIds: [],
      productIds: [product.productId],
    });
    const buyXGiftPromo = await createPromotion(ctx.api, {
      name: `PROMO17-BXGY-${Date.now()}`,
      description: "PROMO-17 manual BUY_X_GET_Y preview before address",
      type: "BUY_X_GET_Y",
      discountValue: 0,
      minOrderValue: 0,
      maxDiscount: 0,
      startDate: nowLocalDateTime(-1),
      endDate: nowLocalDateTime(10),
      active: true,
      appliesTo: "PRODUCT",
      minOrderScope: "WHOLE_ORDER",
      buyQty: 1,
      getProductId: product.productId,
      getQty: 1,
      minBuyQty: null,
      maxBuyQty: null,
      buyItems: [{ productId: product.productId, buyQty: 1, sortOrder: 0 }],
      repeatable: true,
      maxGiftApplications: null,
      categoryIds: [],
      productIds: [product.productId],
    });

    const cartLine = {
      id: `promo-line-${Date.now()}`,
      productId: String(product.productId),
      variantId: String(product.variantId),
      productName: code,
      variantName: "E2E variant",
      qty: 1,
      unitPrice: 120000,
      lineSubtotal: 120000,
      stock: 999,
      catalogSource: "backend",
      schemaVersion: 2,
    };

    for (const [caseId, runCase] of [
      ["PROMO-13", async () => {
        await setCart(driver, origin, cartLine);
        await installNetworkTap(driver);
        await driver.get(`${origin}/cart`);
        await installNetworkTap(driver);
        await waitPromotionEvaluationLoaded(driver);
        await driver.findElement(By.css(`[data-testid="cart-promo-option-${promoA.id}"]`)).click();
        await driver.get(`${origin}/checkout`);
        await installNetworkTap(driver);
        await driver.wait(until.elementLocated(By.css('[data-testid="checkout-effective-promotion-id"]')), 20000);
        const effId = await getNodeText(driver, '[data-testid="checkout-effective-promotion-id"]');
        const effName = await getNodeText(driver, '[data-testid="checkout-effective-promotion-name"]');
        if (String(effId) !== String(promoA.id)) throw new Error(`Expected effective id ${promoA.id} before address, got ${effId}`);
        if (effName !== promoA.name) throw new Error(`Expected promo name ${promoA.name} before address, got ${effName}`);
        const tapBefore = await readNetworkTap(driver);
        if ((tapBefore.pickBest ?? []).length > 0) throw new Error("Manual mode should not call /api/promotions/pick-best on checkout preview");

        await fillCheckoutContactAndStreet(driver, { name: "E2E Promo13", phone: "0912345678", street: "1 E2E Street" });
        await selectFirstFullAddress(driver);
        await driver.wait(async () => {
          const tap = await readNetworkTap(driver);
          return (tap.salesQuote ?? []).length > 0;
        }, 60000);
        const tap = await readNetworkTap(driver);
        const lastQuote = tap.salesQuote[tap.salesQuote.length - 1];
        const req = JSON.parse(lastQuote.requestBody || "{}");
        const res = JSON.parse(lastQuote.responseBody || "{}");
        if (Number(req.promotionId) !== Number(promoA.id)) throw new Error(`quote request promotionId expected ${promoA.id}, got ${req.promotionId}`);
        if (Number(res.effectivePromotionId) !== Number(promoA.id)) throw new Error(`quote response effectivePromotionId expected ${promoA.id}, got ${res.effectivePromotionId}`);
        if (String(res.effectivePromotionName) !== String(promoA.name)) throw new Error(`quote response effectivePromotionName expected ${promoA.name}, got ${res.effectivePromotionName}`);
        if (Number(res.pricingBreakdownSnapshot?.promotionDiscount ?? 0) <= 0) throw new Error("promotionDiscount must be > 0 for PROMO-13");
        const promoRow = await driver.findElement(By.css('[data-testid="checkout-promotion-discount"]')).getText();
        if (!promoRow.includes(promoA.name)) throw new Error(`UI promotion row should keep manual promo name ${promoA.name}`);
      }],
      ["PROMO-14", async () => {
        await setCart(driver, origin, cartLine);
        await installNetworkTap(driver);
        await driver.get(`${origin}/cart`);
        await installNetworkTap(driver);
        await waitPromotionEvaluationLoaded(driver);
        await driver.findElement(By.css(`[data-testid="cart-promo-option-${freeShip.id}"]`)).click();
        await driver.findElement(By.css(`[data-testid="cart-promo-needs-address-${freeShip.id}"]`));

        const rawCart = await driver.executeScript("return window.localStorage.getItem('nhadan.cart.v1');");
        const cartState = JSON.parse(rawCart || "{}");
        if (String(cartState.selectedPromotionId) !== String(freeShip.id)) throw new Error("localStorage selectedPromotionId mismatch for free shipping");
        if (String(cartState.selectedPromotionMode) !== "manual") throw new Error("localStorage selectedPromotionMode should be manual");
        const cartBody = await driver.findElement(By.css("body")).getText();
        if (cartBody.includes("Giảm phí giao hàng")) throw new Error("Cart should not show shipping discount before address");

        await driver.get(`${origin}/checkout`);
        await installNetworkTap(driver);
        const beforeTap = await readNetworkTap(driver);
        const beforeQuoteCount = (beforeTap.salesQuote ?? []).length;
        const effId = await getNodeText(driver, '[data-testid="checkout-effective-promotion-id"]');
        if (String(effId) !== String(freeShip.id)) throw new Error(`Checkout effective id expected ${freeShip.id}, got ${effId}`);

        await fillCheckoutContactAndStreet(driver, { name: "E2E Promo14", phone: "0912345679", street: "2 E2E Street" });
        await selectFirstFullAddress(driver);
        await driver.wait(async () => {
          const tap = await readNetworkTap(driver);
          return (tap.salesQuote ?? []).length > beforeQuoteCount;
        }, 60000);
        const tapAfter = await readNetworkTap(driver);
        const lastQuote = tapAfter.salesQuote[tapAfter.salesQuote.length - 1];
        const req = JSON.parse(lastQuote.requestBody || "{}");
        const res = JSON.parse(lastQuote.responseBody || "{}");
        if (Number(req.promotionId) !== Number(freeShip.id)) throw new Error(`quote request promotionId expected ${freeShip.id}, got ${req.promotionId}`);
        if (String(res.effectivePromotionType) !== "FREE_SHIPPING") throw new Error(`effectivePromotionType expected FREE_SHIPPING, got ${res.effectivePromotionType}`);
        const pb = res.pricingBreakdownSnapshot ?? {};
        const shippingFee = Number(pb.shippingFee ?? 0);
        const maxDiscount = Number(freeShip.maxDiscount ?? 0);
        const expectedShippingDiscount = maxDiscount > 0 ? Math.min(shippingFee, maxDiscount) : shippingFee;
        if (Number(pb.shippingDiscount ?? 0) !== expectedShippingDiscount) {
          throw new Error(`shippingDiscount expected ${expectedShippingDiscount}, got ${pb.shippingDiscount}`);
        }
        if (Number(pb.promotionDiscount ?? 0) !== 0) throw new Error(`promotionDiscount must be 0 for free shipping, got ${pb.promotionDiscount}`);
        await driver.findElement(By.css('[data-testid="checkout-shipping-discount"]'));
        const promoRows = await driver.findElements(By.css('[data-testid="checkout-promotion-discount"]'));
        if (promoRows.length > 0) throw new Error("checkout-promotion-discount must be hidden for FREE_SHIPPING");
      }],
      ["PROMO-15", async () => {
        await setCart(driver, origin, cartLine);
        await driver.get(`${origin}/cart`);
        await waitPromotionEvaluationLoaded(driver);
        await driver.findElement(By.css(`[data-testid="cart-promo-option-${quantityGiftPromo.id}"]`)).click();
        const giftBlock = await driver.findElement(By.css('[data-testid="cart-summary-promotion-gifts"]')).getText();
        if (!giftBlock.includes(quantityGiftPromo.name)) throw new Error("PROMO-15 must be QUANTITY_GIFT and include promo name");
        const giftLines = await driver.findElements(By.css('[data-testid^="cart-summary-promotion-gift-line-"]'));
        if (giftLines.length === 0) {
          await driver.findElement(By.css('[data-testid="cart-summary-promotion-gifts-pending"]'));
        } else {
          const giftLine = await giftLines[0].getText();
          if (!giftLine.includes("🎁")) throw new Error("Gift line should be visible for PROMO-15 when API returns line");
        }
      }],
      ["PROMO-16", async () => {
        await setCart(driver, origin, cartLine);
        await driver.get(`${origin}/cart`);
        await waitPromotionEvaluationLoaded(driver);
        await driver.findElement(By.css(`[data-testid="cart-promo-option-${fixedPromo.id}"]`)).click();
        await driver.get(`${origin}/checkout`);
        const promoRow = await driver.findElement(By.css('[data-testid="checkout-promotion-discount"]')).getText();
        if (!promoRow.includes(fixedPromo.name)) throw new Error("Manual fixed promo must show promotion row before address");
        if (!promoRow.includes("7.000")) throw new Error("Manual fixed promo amount must be visible before address");
      }],
      ["PROMO-17", async () => {
        await setCart(driver, origin, cartLine);
        await driver.get(`${origin}/cart`);
        await waitPromotionEvaluationLoaded(driver);
        await driver.findElement(By.css(`[data-testid="cart-promo-option-${buyXGiftPromo.id}"]`)).click();
        await driver.get(`${origin}/checkout`);
        await driver.findElement(By.css('[data-testid="checkout-promotion-gifts"]'));
      }],
    ]) {
      try {
        await runCase();
        const idx = caseResults.findIndex((x) => x.caseId === caseId);
        caseResults[idx] = { caseId, outcome: "pass" };
      } catch (e) {
        const tap = await readNetworkTap(driver);
        const dump = await dumpPromoFailureContext(driver, ctx.config.artifactDir, caseId, {
          lastError: e?.message || String(e),
          lastSalesQuote: tap.salesQuote?.[tap.salesQuote.length - 1] ?? null,
          lastPickBest: tap.pickBest?.[tap.pickBest.length - 1] ?? null,
        });
        const idx = caseResults.findIndex((x) => x.caseId === caseId);
        caseResults[idx] = { caseId, outcome: "fail", reason: e?.message || String(e), contextPath: dump.contextPath };
        failDumps.push({ caseId, dump: dump.contextPath });
      }
    }

    if (failDumps.length > 0) {
      throw new Error(failDumps.map((x) => `${x.caseId}: ${x.dump}`).join("; "));
    }
    return { caseResults };
  },
};
