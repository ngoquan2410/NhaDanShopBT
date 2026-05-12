import { By, Key, until, logging } from "selenium-webdriver";
import { pickSellableVariantScan } from "../helpers/adminSales.mjs";

const SHIPPING_ADDR = {
  receiverName: "Hotfix Gate",
  phone: "0909123456",
  provinceCode: "79",
  provinceName: "Ho Chi Minh",
  districtCode: "1442",
  districtName: "Quan 1",
  wardCode: "21211",
  wardName: "Ben Nghe",
  street: "1 Le Loi",
  rawAddress: null,
  note: null,
};

async function assertNoSevereBrowserLogs(driver) {
  let entries;
  try {
    entries = await driver.manage().logs().get(logging.Type.BROWSER);
  } catch {
    return;
  }
  const bad = entries.filter((e) => String(e.level?.name || e.level) === "SEVERE");
  if (bad.length > 0) {
    throw new Error(`Browser console SEVERE:\n${bad.map((e) => e.message).join("\n")}`);
  }
}

async function installFetchProbe(driver) {
  await driver.executeScript(`
    window.__hotfixApiLog = [];
    const orig = window.fetch.bind(window);
    window.fetch = (...args) => {
      try {
        const u = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";
        window.__hotfixApiLog.push(String(u));
      } catch {}
      return orig(...args);
    };
  `);
}

async function getFetchLog(driver) {
  return driver.executeScript("return window.__hotfixApiLog || [];");
}

function cr(name, status, extra = {}) {
  return { case: name, status, ...extra };
}

/**
 * Full-stack gate for hotfix scope: storefront category + nav typeahead network proofs,
 * quote→pending total alignment, Casso compact webhook, over/under review, admin unmatched wording.
 */
export default {
  name: "Hotfix storefront + payment (storefront network + API + admin UX)",
  tags: ["hotfix-storefront-payment"],
  order: 22,
  async run(driver, ctx) {
    const base = ctx.config.baseUrl.replace(/\/$/, "");
    const apiOrigin = ctx.config.apiBaseUrl.replace(/\/$/, "");
    const cassoToken = process.env.CASSO_WEBHOOK_SECURE_TOKEN?.trim();
    const results = [];

    const health = await fetch(`${apiOrigin}/actuator/health`);
    if (!health.ok) {
      throw new Error(`Backend health check failed: HTTP ${health.status} (expected 200)`);
    }
    const feProbe = await fetch(base, { signal: AbortSignal.timeout(8000) }).catch((e) => {
      throw new Error(`Frontend unreachable: ${e?.message || e}`);
    });
    if (!feProbe.ok) {
      throw new Error(`Frontend HTTP ${feProbe.status} (expected 200)`);
    }
    if (!cassoToken) {
      throw new Error(
        "Set CASSO_WEBHOOK_SECURE_TOKEN to the same value as the running backend (e.g. export before bootRun) — Casso API cases are mandatory for this gate.",
      );
    }

    // Full navigation replaces the JS realm — install the fetch probe only after the page is loaded.
    await driver.navigate().to(`${base}/`);
    await driver.sleep(1200);
    await installFetchProbe(driver);

    // --- storefront_category_filter_calls_backend ---
    try {
      const cats = await ctx.api.fetchJson("/api/categories");
      const list = Array.isArray(cats) ? cats : cats.content || [];
      const withId = list.find((c) => c && c.id != null && c.active !== false);
      if (!withId) {
        throw new Error("No public active categories available; UX gate cannot be skipped.");
      } else {
        const chip = await driver.findElements(By.css(`[data-testid="storefront-home-category-${withId.id}"]`));
        if (chip.length === 0) {
          throw new Error(`Category chip data-testid storefront-home-category-${withId.id} not found`);
        }
        await driver.executeScript("window.__hotfixApiLog = [];");
        await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", chip[0]);
        await chip[0].click();
        await driver.sleep(1200);
        const log = await getFetchLog(driver);
        const hit = log.some((u) => String(u).includes("/api/products") && String(u).includes(`categoryId=${withId.id}`));
        if (!hit) {
          throw new Error(`Expected /api/products?...categoryId=${withId.id} in network log, got: ${JSON.stringify(log.slice(-12))}`);
        }
        await assertNoSevereBrowserLogs(driver);
        results.push(cr("storefront_category_filter_calls_backend", "pass"));
      }
    } catch (e) {
      results.push(cr("storefront_category_filter_calls_backend", "fail", { error: e?.message || String(e) }));
      throw e;
    }

    // --- storefront_nav_typeahead_backend_dropdown ---
    try {
      await driver.navigate().to(`${base}/`);
      await driver.sleep(1200);
      await installFetchProbe(driver);
      const input = await driver.wait(
        until.elementLocated(By.css('[data-testid="storefront-nav-search-input"]')),
        15000,
      );
      await input.click();
      await input.sendKeys("abc");
      await driver.sleep(600);
      const dropdown = await driver.wait(
        until.elementLocated(By.css('[data-testid="storefront-nav-typeahead-dropdown"]')),
        12000,
      );
      await driver.wait(until.elementIsVisible(dropdown), 5000);
      const log = await getFetchLog(driver);
      const hit = log.some((u) => String(u).includes("/api/products") && String(u).includes("search=") && String(u).includes("size=8"));
      if (!hit) {
        throw new Error(`Expected typeahead /api/products?search=&size=8, got: ${JSON.stringify(log.slice(-15))}`);
      }
      const leak = log.find((u) => /costPrice|stockQty|minStockQty|batchId/i.test(String(u)));
      if (leak) {
        throw new Error(`Unexpected internal field in request URL: ${leak}`);
      }
      await assertNoSevereBrowserLogs(driver);
      results.push(cr("storefront_nav_typeahead_backend_dropdown", "pass"));
    } catch (e) {
      results.push(cr("storefront_nav_typeahead_backend_dropdown", "fail", { error: e?.message || String(e) }));
      throw e;
    }

    // --- API: admin token + variant with real sellable stock (quotes enforce availability) ---
    const adminUser = ctx.config.adminUsername;
    const adminPass = ctx.config.adminPassword;
    if (!adminUser || !adminPass) {
      throw new Error("ADMIN_USERNAME and ADMIN_PASSWORD required for quote/pending/Casso API checks");
    }
    const loginForStock = await ctx.api.authLoginJson(adminUser, adminPass);
    ctx.api.setAccessToken(
      typeof loginForStock.accessToken === "string"
        ? loginForStock.accessToken
        : String(loginForStock.accessToken),
    );
    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const projArr = Array.isArray(projections) ? projections : [];
    /** Quotes + pendings + one Casso confirm burn FEFO stock — prefer a comfortably stocked SKU. */
    const stockPick =
      pickSellableVariantScan(projArr, { minAvail: 50 }) ||
      pickSellableVariantScan(projArr, { minAvail: 25 }) ||
      pickSellableVariantScan(projArr, { minAvail: 12 }) ||
      pickSellableVariantScan(projArr, { minAvail: 6 });
    if (!stockPick) {
      throw new Error(
        "Harness/environment: no variant with enough sellableQty in GET /api/inventory/projections — add stock or run fixtures-bootstrap",
      );
    }
    const productId = stockPick.productId;
    const variantId = stockPick.variantId;
    const baseLine = (qty) => ({
      productId,
      variantId,
      quantity: qty,
      discountPercent: 0,
      rewardLine: false,
    });

    const quote = await ctx.api.fetchJson("/api/sales/quote", {
      method: "POST",
      json: {
        source: "storefront",
        customerId: null,
        lines: [baseLine(1)],
        promotionId: null,
        voucherCode: process.env.HOTFIX_VOUCHER_CODE?.trim() || "FREESHIP100",
        shippingAddress: SHIPPING_ADDR,
        manualDiscount: 0,
        vatPercent: 0,
        requestedRedeemPoints: null,
      },
    });
    const quoteTotal = Number(quote.pricingBreakdownSnapshot?.total ?? -1);
    if (quoteTotal < 0) throw new Error("Quote missing pricingBreakdownSnapshot.total");
    const pb = quote.pricingBreakdownSnapshot;
    if (Number(pb.voucherDiscount ?? 0) !== 0) {
      throw new Error(`FREESHIP voucher must not reduce merchandise voucherDiscount, got ${pb.voucherDiscount}`);
    }
    if (Number(pb.shippingDiscount ?? 0) <= 0 || Number(pb.shippingDiscount ?? 0) > Number(pb.shippingFee ?? 0)) {
      throw new Error(`FREESHIP shipping discount must be >0 and capped by shipping fee, got ${pb.shippingDiscount}/${pb.shippingFee}`);
    }
    results.push(cr("checkout_freeship_voucher_bucket_and_total", "pass"));

    const pending = await ctx.api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: {
        customerName: "Hotfix API",
        customerPhone: "0909111222",
        shippingAddress: SHIPPING_ADDR,
        paymentMethod: "bank_transfer",
        quotePublicId: quote.quoteId,
        note: "hotfix selenium",
      },
    });
    const pendingTotal = Number(pending.pricingBreakdownSnapshot?.total ?? -2);
    if (pendingTotal !== quoteTotal) {
      throw new Error(`checkout quote total ${quoteTotal} !== pending total ${pendingTotal}`);
    }
    results.push(cr("pending_created_from_quote_total_matches", "pass", { note: "quoteId path totals" }));

    const receiptsPage1 = await ctx.api.fetchJson("/api/receipts?page=0&size=20");
    if (Number(receiptsPage1.totalElements ?? 0) >= 42 && Number(receiptsPage1.content?.length ?? 0) !== 20) {
      throw new Error(`Receipts API page 1 expected 20 rows for total>=42, got ${receiptsPage1.content?.length}`);
    }
    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: adminUser, password: adminPass });
    await driver.navigate().to(`${base}/admin/goods-receipts`);
    await driver.wait(until.elementLocated(By.css('[data-testid^="goods-receipt-row-"]')), 25000);
    await driver.sleep(900);
    const receiptRows = await driver.findElements(By.css('[data-testid^="goods-receipt-row-"]'));
    if (Number(receiptsPage1.content?.length ?? 0) !== receiptRows.length) {
      throw new Error(`Goods receipts UI row count ${receiptRows.length} != API content ${receiptsPage1.content?.length}`);
    }
    const pageText = await driver.findElement(By.css("body")).getText();
    const receiptTotal = Number(receiptsPage1.totalElements ?? 0);
    const receiptFirstEnd = Math.min(20, receiptTotal);
    if (receiptTotal > 0 && !pageText.includes(`1-${receiptFirstEnd} / ${receiptTotal}`)) {
      throw new Error(`Goods receipts footer did not show 1-${receiptFirstEnd} / ${receiptTotal}`);
    }
    results.push(cr("goods_receipts_page_renders_all_content_rows", "pass"));

    const comboPage = await ctx.api.fetchJson("/api/products?productType=COMBO&page=0&size=8&sort=name,asc");
    await driver.navigate().to(`${base}/`);
    await driver.sleep(1200);
    const comboSections = await driver.findElements(By.css('[data-testid="storefront-home-combo-section"]'));
    const publicCombos = Array.isArray(comboPage.content) ? comboPage.content : [];
    const comboJson = JSON.stringify(comboPage);
    if (/costPrice|totalComponentCost|lineCost|stockQty|minStockQty|batchId|remainingQty/i.test(comboJson)) {
      throw new Error("Public combo catalog payload leaked internal stock/cost/batch fields");
    }
    if (publicCombos.length === 0 && comboSections.length > 0) {
      throw new Error("Combo section rendered without real public COMBO catalog data");
    }
    if (publicCombos.length > 0 && comboSections.length === 0) {
      throw new Error("Public COMBO catalog data exists but storefront combo section did not render");
    }
    results.push(cr("storefront_combo_section_no_fake_data", "pass"));

    const orderCode = String(pending.code || pending.orderNo || "");
    const compact = orderCode.replace(/-/g, "");
    const tid = `HOTFIX_${Date.now()}`;

    const postCasso = async (description, amount, id) => {
      const body = {
        error: 0,
        data: [
          {
            tid: id,
            description,
            amount: String(amount),
            when: "2026-05-12 10:15:30",
          },
        ],
      };
      const res = await ctx.api.fetch("/api/webhooks/casso", {
        method: "POST",
        headers: { "secure-token": cassoToken, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`Casso webhook HTTP ${res.status}: ${text.slice(0, 400)}`);
      }
    };

    // --- casso_compact_content_auto_confirms ---
    await postCasso(`ck ${compact} done`, quoteTotal, `${tid}_CMP`);
    const confirmed = await ctx.api.fetchJson(`/api/pending-orders/${pending.id}`);
    if (String(confirmed.status) !== "confirmed") {
      throw new Error(`Expected pending confirmed after compact Casso, got ${confirmed.status}`);
    }
    if (!confirmed.invoice) {
      throw new Error("Expected confirmed Casso exact order to have invoice");
    }
    results.push(cr("casso_exact_webhook_creates_invoice_and_confirms", "pass"));

    // Fresh pending for under/over
    const quote2 = await ctx.api.fetchJson("/api/sales/quote", {
      method: "POST",
      json: {
        source: "storefront",
        customerId: null,
        lines: [baseLine(1)],
        promotionId: null,
        voucherCode: null,
        shippingAddress: SHIPPING_ADDR,
        manualDiscount: 0,
        vatPercent: 0,
        requestedRedeemPoints: null,
      },
    });
    const pending2 = await ctx.api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: {
        customerName: "Hotfix API2",
        customerPhone: "0909111333",
        shippingAddress: SHIPPING_ADDR,
        paymentMethod: "bank_transfer",
        quotePublicId: quote2.quoteId,
        note: "hotfix selenium 2",
      },
    });
    const t2 = quote2.pricingBreakdownSnapshot.total;
    const c2 = String(pending2.code).replace(/-/g, "");
    await postCasso(`pay ${c2}`, Number(t2) - 1, `${tid}_LOW`);
    const lowState = await ctx.api.fetchJson(`/api/pending-orders/${pending2.id}`);
    if (String(lowState.status) === "confirmed") {
      throw new Error("Underpaid Casso must not confirm pending");
    }
    results.push(cr("casso_underpaid_goes_review", "pass"));

    const quote3 = await ctx.api.fetchJson("/api/sales/quote", {
      method: "POST",
      json: {
        source: "storefront",
        customerId: null,
        lines: [baseLine(1)],
        promotionId: null,
        voucherCode: null,
        shippingAddress: SHIPPING_ADDR,
        manualDiscount: 0,
        vatPercent: 0,
        requestedRedeemPoints: null,
      },
    });
    const pending3 = await ctx.api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: {
        customerName: "Hotfix API3",
        customerPhone: "0909111444",
        shippingAddress: SHIPPING_ADDR,
        paymentMethod: "bank_transfer",
        quotePublicId: quote3.quoteId,
        note: "hotfix selenium 3",
      },
    });
    const t3 = quote3.pricingBreakdownSnapshot.total;
    const c3 = String(pending3.code).replace(/-/g, "");
    await postCasso(`pay ${c3}`, Number(t3) + 1, `${tid}_HIGH`);
    const highState = await ctx.api.fetchJson(`/api/pending-orders/${pending3.id}`);
    if (String(highState.status) === "confirmed") {
      throw new Error("Overpaid Casso must not confirm pending");
    }
    results.push(cr("casso_overpaid_goes_review", "pass"));

    // --- admin UI: manual link + candidate wording (API token already set) ---
    const mkQuote = async (qty) =>
      ctx.api.fetchJson("/api/sales/quote", {
        method: "POST",
        json: {
          source: "storefront",
          customerId: null,
          lines: [baseLine(qty)],
          promotionId: null,
          voucherCode: null,
          shippingAddress: SHIPPING_ADDR,
          manualDiscount: 0,
          vatPercent: 0,
          requestedRedeemPoints: null,
        },
      });

    const qLow = await mkQuote(1);
    const qMid = await mkQuote(2);
    const qHigh = await mkQuote(3);
    const tLow = Number(qLow.pricingBreakdownSnapshot.total);
    const tMid = Number(qMid.pricingBreakdownSnapshot.total);
    const tHigh = Number(qHigh.pricingBreakdownSnapshot.total);
    if (!(tLow < tMid && tMid < tHigh)) {
      throw new Error(`Expected totals low<mid<high, got ${tLow}, ${tMid}, ${tHigh}`);
    }

    const pLow = await ctx.api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: {
        customerName: "HotfixML Low",
        customerPhone: "0909111661",
        shippingAddress: SHIPPING_ADDR,
        paymentMethod: "bank_transfer",
        quotePublicId: qLow.quoteId,
        note: "manual wording low",
      },
    });
    const pMid = await ctx.api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: {
        customerName: "HotfixML Mid",
        customerPhone: "0909111662",
        shippingAddress: SHIPPING_ADDR,
        paymentMethod: "bank_transfer",
        quotePublicId: qMid.quoteId,
        note: "manual wording mid",
      },
    });
    const pHigh = await ctx.api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: {
        customerName: "HotfixML High",
        customerPhone: "0909111663",
        shippingAddress: SHIPPING_ADDR,
        paymentMethod: "bank_transfer",
        quotePublicId: qHigh.quoteId,
        note: "manual wording high",
      },
    });

    const evTid = `${tid}_ML`;
    await ctx.api.fetch("/api/webhooks/casso", {
      method: "POST",
      headers: { "secure-token": cassoToken, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: 0,
        data: [
          {
            tid: evTid,
            description: "no order ref",
            amount: String(tMid),
            when: "2026-05-12 11:00:00",
          },
        ],
      }),
    });

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: adminUser, password: adminPass });
    await driver.navigate().to(`${base}/admin/unmatched-payments`);
    await driver.wait(until.elementLocated(By.xpath("//h1[contains(., 'Đối soát giao dịch')]")), 25000);
    await driver.sleep(800);
    const linkBtn = await driver.wait(
      until.elementLocated(
        By.xpath(
          "//tr[.//td[contains(.,'no order ref')]]//button[contains(normalize-space(.),'Gắn vào đơn')]",
        ),
      ),
      25000,
    );
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", linkBtn);
    await driver.wait(until.elementIsVisible(linkBtn), 8000);
    try {
      await linkBtn.click();
    } catch {
      await driver.executeScript("arguments[0].click();", linkBtn);
    }
    await driver.sleep(600);
    const searchInput = await driver.wait(
      until.elementLocated(By.css('[role="dialog"] input[placeholder*="mã đơn"], [data-radix-dialog-content] input')),
      15000,
    );
    await driver.wait(until.elementIsVisible(searchInput), 8000);
    try {
      await searchInput.click();
    } catch {
      await driver.executeScript("arguments[0].focus();", searchInput);
    }
    await searchInput.sendKeys(Key.chord(Key.CONTROL, "a"), Key.BACK_SPACE);
    await searchInput.sendKeys("HotfixML");
    await driver.sleep(900);

    const exactSnippet = await driver.executeScript(`
      const b = document.querySelector('[data-amount-relation="exact"]');
      return b ? b.innerText : "";
    `);
    if (!String(exactSnippet).includes("Khớp đúng số tiền")) {
      throw new Error(`Expected exact-match candidate label, got: ${JSON.stringify(exactSnippet)}`);
    }
    const underSnippet = await driver.executeScript(`
      const b = document.querySelector('[data-amount-relation="under"]');
      return b ? b.innerText : "";
    `);
    if (!/Thiếu\s+[\d.,]+[\s\u00a0]*₫\s+— cần đối soát/.test(String(underSnippet))) {
      throw new Error(`Expected underpaid label, got: ${JSON.stringify(underSnippet)}`);
    }
    const overSnippet = await driver.executeScript(`
      const b = document.querySelector('[data-amount-relation="over"]');
      return b ? b.innerText : "";
    `);
    if (!/Dư\s+[\d.,]+[\s\u00a0]*₫\s+— cần đối soát/.test(String(overSnippet))) {
      throw new Error(`Expected overpaid label, got: ${JSON.stringify(overSnippet)}`);
    }
    results.push(cr("unmatched_wording_exact_under_over", "pass"));

    const exactRow = await driver.findElement(By.css(`[data-testid="unmatched-link-candidate-${pMid.code}"]`));
    await driver.executeScript("arguments[0].scrollIntoView({block:'center'});", exactRow);
    try {
      await exactRow.click();
    } catch {
      await driver.executeScript("arguments[0].click();", exactRow);
    }
    await driver.sleep(1500);
    const paidAuto = await ctx.api.fetchJson(`/api/pending-orders/${pMid.id}`);
    if (String(paidAuto.status) !== "paid_auto") {
      throw new Error(`manual link exact amount: expected paid_auto, got ${paidAuto.status}`);
    }
    if (paidAuto.invoice != null) {
      throw new Error("manual link must not attach invoice");
    }
    results.push(cr("manual_link_exact_sets_paid_auto_not_confirmed", "pass"));

    const linkViaApi = async (order, amount, suffix) => {
      const eventTid = `${tid}_${suffix}`;
      const res = await ctx.api.fetch("/api/webhooks/casso", {
        method: "POST",
        headers: { "secure-token": cassoToken, "Content-Type": "application/json" },
        body: JSON.stringify({
          error: 0,
          data: [{ tid: eventTid, description: `manual ${suffix}`, amount: String(amount), when: "2026-05-12 11:05:00" }],
        }),
      });
      if (!res.ok) throw new Error(`manual ${suffix} event ingest failed HTTP ${res.status}`);
      const events = await ctx.api.fetchJson(`/api/payment-events/unmatched?search=${encodeURIComponent(eventTid)}&page=0&size=5`);
      const ev = (events.content || []).find((e) => String(e.providerTxId) === eventTid);
      if (!ev) throw new Error(`manual ${suffix} event not visible in unmatched page`);
      await ctx.api.fetchJson(`/api/payment-events/${ev.id}/link`, {
        method: "POST",
        json: { orderCode: order.code, linkedBy: "admin" },
      });
      return ctx.api.fetchJson(`/api/pending-orders/${order.id}`);
    };
    const overLinked = await linkViaApi(pLow, tMid, "ML_OVER");
    if (overLinked.status === "paid_auto" || overLinked.status === "confirmed" || overLinked.invoice != null) {
      throw new Error(`manual overpaid must stay review/no invoice, got ${overLinked.status}`);
    }
    if (overLinked.paymentLinkStatus !== "OVERPAID_LINKED") {
      throw new Error(`manual overpaid expected OVERPAID_LINKED, got ${overLinked.paymentLinkStatus}`);
    }
    results.push(cr("manual_link_overpaid_visible_review_state", "pass"));

    const underLinked = await linkViaApi(pHigh, tMid, "ML_UNDER");
    if (underLinked.status === "paid_auto" || underLinked.status === "confirmed" || underLinked.invoice != null) {
      throw new Error(`manual underpaid must stay review/no invoice, got ${underLinked.status}`);
    }
    if (underLinked.paymentLinkStatus !== "UNDERPAID_LINKED") {
      throw new Error(`manual underpaid expected UNDERPAID_LINKED, got ${underLinked.paymentLinkStatus}`);
    }
    results.push(cr("manual_link_underpaid_visible_review_state", "pass"));

    ctx.api.setAccessToken(null);

    return { outcome: "pass", caseResults: results };
  },
};
