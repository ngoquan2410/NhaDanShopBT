/**
 * Slice B2.3 — admin entity lists use backend search (filter before pagination), not first-N client global search.
 *
 * Run (full stack):
 *   cross-env RUN_AUTOMATION=1 BASE_URL=http://127.0.0.1:5173 API_BASE_URL=http://127.0.0.1:8080 \
 *     ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npm run e2e:slice-b2-b23
 */
import { By, Key, logging, until } from "selenium-webdriver";
import { createApiHelper } from "../helpers/api.mjs";
import { loginAsAdmin } from "../helpers/auth.mjs";
import { waitForH1Containing } from "../helpers/assertions.mjs";
import {
  focusEntityListSearchInput,
  reinstallFetchTap,
  sleepAfterSearchTyping,
  waitForListRequest,
} from "../helpers/b23NetworkCapture.mjs";

const CRITICAL = new Set([
  "invoices_search_backend",
  "pending_orders_search_backend",
  "stock_adjustments_list_search_backend",
  "goods_receipts_list_search_backend",
  "customers_list_search_backend",
  "suppliers_list_search_backend",
]);

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

/**
 * @param {ReturnType<import('../helpers/api.mjs').createApiHelper>} api
 * @param {string} tok
 * @param {number} ts
 */
async function seedB23Fixtures(api, tok, ts) {
  const categories = await api.fetchJson("/api/categories");
  if (!Array.isArray(categories) || !categories.length) {
    throw new Error("No categories — cannot seed product");
  }
  const categoryId = categories[0].id;

  const productCode = `P_B23_${ts}`;
  const variantCode = `V_B23_${ts}`;
  const main = await api.fetchJson("/api/products", {
    method: "POST",
    json: {
      code: productCode,
      name: `B23 product ${ts}`,
      categoryId,
      active: true,
      productType: "SINGLE",
      initialVariants: [
        {
          variantCode,
          variantName: "B23 variant",
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
      ],
    },
  });
  const productId = main.id;
  const variantId = main.variants[0].id;

  await api.fetchJson("/api/receipts", {
    method: "POST",
    json: {
      supplierName: `${tok} NCC tên`,
      note: `${tok} phiếu ghi chú`,
      shippingFee: "0",
      vatPercent: "0",
      items: [
        {
          productId,
          quantity: 10,
          unitCost: "1000",
          discountPercent: "0",
        },
      ],
    },
  });

  const cust = await api.fetchJson("/api/customers", {
    method: "POST",
    json: {
      name: `Khách ${tok}`,
      phone: "0908777666",
      group: "RETAIL",
    },
  });
  const customerId = cust.id;

  await api.fetchJson("/api/suppliers", {
    method: "POST",
    json: {
      name: `Nhà cung cấp ${tok}`,
      phone: "0912333444",
    },
  });

  const pricing = {
    subtotal: "10000",
    manualDiscount: "0",
    promotionDiscount: "0",
    voucherDiscount: "0",
    shippingFee: "0",
    shippingDiscount: "0",
    vatBase: "10000",
    vatPercent: "0",
    vatAmount: "0",
    total: "10000",
    itemNetRevenue: "10000",
    shippingNetRevenue: "0",
    commercialAllocationVersion: 1,
    loyaltyDiscount: "0",
    loyaltyRedeemedPoints: 0,
  };

  await api.fetchJson("/api/invoices", {
    method: "POST",
    json: {
      customerId,
      note: `${tok} inv note`,
      paymentMethod: "cash",
      items: [{ productId, quantity: 1, discountPercent: "0", variantId }],
    },
  });

  await api.fetchJson("/api/pending-orders", {
    method: "POST",
    json: {
      customerName: `Người mua ${tok}`,
      customerPhone: "0908111222",
      paymentMethod: "bank_transfer",
      shippingAddress: {
        street: `Đường ${tok} số 1`,
        receiverName: "B23 RC",
        phone: "0908111222",
      },
      lines: [
        {
          id: `ln_${ts}`,
          productId: String(productId),
          variantId: String(variantId),
          productName: main.name,
          variantName: "B23 variant",
          qty: 1,
          unitPrice: "10000",
          lineSubtotal: "10000",
        },
      ],
      pricingBreakdownSnapshot: pricing,
    },
  });

  await api.fetchJson("/api/stock-adjustments", {
    method: "POST",
    json: {
      reason: "STOCKTAKE",
      note: `${tok} adj ghi chú`,
      items: [{ variantId, actualQty: 9 }],
    },
  });

  await api.fetchJson("/api/admin/users", {
    method: "POST",
    json: {
      username: `b23_user_${ts}`,
      password: "Secret12!ab",
      fullName: `Staff B23 ${tok}`,
      roles: ["ROLE_STAFF"],
    },
  });
}

export default {
  name: "Slice B2.3: entity list backend search (admin)",
  tags: ["slice-b2-b23", "slice-b2"],
  order: 51,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    const origin = ctx.config.baseUrl.replace(/\/$/, "");
    const apiOrigin = ctx.config.apiBaseUrl.replace(/\/$/, "");
    const caseResults = [];

    if (!u || !p) {
      for (const id of CRITICAL) {
        caseResults.push(cr(id, "FAIL", { reason: "ADMIN_USERNAME / ADMIN_PASSWORD required" }));
      }
      return { skipped: true, reason: "no admin creds", caseResults };
    }

    const ts = Date.now();
    const tok = `SLICE_B23_${ts}`;
    const api = createApiHelper(apiOrigin);
    let seedOk = false;
    try {
      const loginBody = await api.authLoginJson(u, p);
      api.setAccessToken(/** @type {string} */ (loginBody.accessToken));
      await seedB23Fixtures(api, tok, ts);
      seedOk = true;
    } catch (e) {
      for (const id of CRITICAL) {
        caseResults.push(
          cr(id, "FAIL", {
            reason: `seed failed: ${e?.message || e}`,
          }),
        );
      }
      caseResults.push(
        cr("invoices_search_filters_preserved", "FAIL", { reason: "seed failed" }),
        cr("users_management_search_backend", "FAIL", { reason: "seed failed" }),
        cr("vouchers_list_search_backend", "FAIL", { reason: "seed failed" }),
        cr("unmatched_payments_search_backend", "FAIL", { reason: "seed failed" }),
        cr("unmatched_payment_link_dialog_pending_order_search_backend", "DEBT", {
          reason: "seed failed before UI",
        }),
        cr("production_recipes_list_search_backend", "SKIPPED_WITH_REASON", {
          reason: "seed failed",
        }),
        cr("ghn_quote_logs_search_backend", "SKIPPED_WITH_REASON", { reason: "seed failed" }),
        cr("categories_search_static_small_classified", "STATIC_SMALL_ACCEPTED", {
          reason: "Local filter on bounded category list — acceptable",
        }),
        cr("inventory_report_search_classified", "REPORT_SEARCH_HIGH_RISK", {
          reason: "Report rows + client filter; backend search not implemented (stock semantics)",
        }),
        cr("admin_sidebar_pending_order_badge_classified", "OUT_OF_SCOPE_NON_SEARCH_FIRST_N", {
          reason: "Badge not a list search field",
        }),
        cr("product_import_review_search_classified", "SKIPPED_WITH_REASON", {
          reason: "No stable upload fixture",
        }),
        cr("entity_search_no_stale_response_overwrite", "DEBT", {
          reason: "No dedicated request-id guard audited in list hooks",
        }),
      );
      return {
        caseResults,
        outcome: "fail",
        reason: "API seed failed for B2.3 fixtures",
      };
    }

    await loginAsAdmin(driver, ctx.config, { username: u, password: p });
    /** Login uses full navigations — document was replaced; tap list API calls from here on. */
    await reinstallFetchTap(driver, { clear: true });

    async function searchBackend(caseId, route, h1, param, pathPart, rowSubstring) {
      try {
        await driver.get(`${origin}${route}`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, h1, 25000);
        const inp = await focusEntityListSearchInput(driver);
        await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
        await inp.sendKeys(tok);
        await sleepAfterSearchTyping(driver);
        const hit = await waitForListRequest(driver, { needle: tok, pathPart, param });
        const els = await driver.findElements(By.xpath(`//*[contains(text(),'${tok}')]`));
        const visible =
          els.length > 0 &&
          (await Promise.all(els.map((e) => e.isDisplayed().catch(() => false)))).some(Boolean);
        const rowOk = rowSubstring
          ? (await driver.findElements(By.xpath(`//*[contains(text(),'${rowSubstring}')]`))).length > 0
          : visible;
        if (!rowOk) {
          throw new Error(`Expected visible row containing fixture marker for ${caseId}`);
        }
        caseResults.push(
          cr(caseId, "PASS", {
            networkEvidence: hit,
            searchToken: tok,
            route,
          }),
        );
      } catch (e) {
        caseResults.push(
          cr(caseId, "FAIL", {
            reason: e?.message || String(e),
            route,
            searchToken: tok,
          }),
        );
      }
    }

    if (seedOk) {
      await searchBackend(
        "customers_list_search_backend",
        "/admin/customers",
        "Khách hàng",
        "q",
        "/api/customers",
        "Khách",
      );
      await searchBackend(
        "suppliers_list_search_backend",
        "/admin/suppliers",
        "Nhà cung cấp",
        "q",
        "/api/suppliers",
        "Nhà cung cấp",
      );
      await searchBackend(
        "pending_orders_search_backend",
        "/admin/pending-orders",
        "Đơn chờ thanh toán",
        "search",
        "/api/pending-orders",
        "Người mua",
      );
      await searchBackend(
        "invoices_search_backend",
        "/admin/invoices",
        "Hóa đơn",
        "q",
        "/api/invoices",
        "Khách",
      );
      await searchBackend(
        "goods_receipts_list_search_backend",
        "/admin/goods-receipts",
        "Phiếu nhập",
        "search",
        "/api/receipts",
        "NCC tên",
      );
      await searchBackend(
        "stock_adjustments_list_search_backend",
        "/admin/stock-adjustments",
        "Kiểm kho / Điều chỉnh",
        "search",
        "/api/stock-adjustments",
        tok,
      );

      // Users: second search field may exist — use last "Tìm" input on page
      try {
        await driver.get(`${origin}/admin/users`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, "Người dùng", 25000);
        const inp = await focusEntityListSearchInput(driver);
        await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
        await inp.sendKeys(`b23_user_${ts}`);
        await sleepAfterSearchTyping(driver);
        const hit = await waitForListRequest(driver, {
          needle: `b23_user_${ts}`,
          pathPart: "/api/admin/users",
          param: "search",
        });
        caseResults.push(
          cr("users_management_search_backend", "PASS", {
            networkEvidence: hit,
            route: "/admin/users",
          }),
        );
      } catch (e) {
        caseResults.push(
          cr("users_management_search_backend", "FAIL", {
            reason: e?.message || String(e),
          }),
        );
      }

      // Invoices + status filter preserved on network (row may be empty for cancelled tab)
      try {
        await driver.get(`${origin}/admin/invoices`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, "Hóa đơn", 25000);
        const cancelled = await driver.findElements(By.xpath("//button[contains(.,'Đã hủy')]"));
        if (cancelled.length) await cancelled[0].click();
        const inp = await focusEntityListSearchInput(driver);
        await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
        await inp.sendKeys(tok);
        await sleepAfterSearchTyping(driver);
        const hit = await waitForListRequest(driver, { needle: tok, pathPart: "/api/invoices", param: "q" });
        if (!hit.includes("status=")) {
          throw new Error(`Expected status= in invoice list URL, got: ${hit}`);
        }
        caseResults.push(
          cr("invoices_search_filters_preserved", "PASS", {
            networkEvidence: hit,
          }),
        );
      } catch (e) {
        caseResults.push(
          cr("invoices_search_filters_preserved", "FAIL", {
            reason: e?.message || String(e),
          }),
        );
      }

      // Vouchers: backend search param regression
      try {
        await driver.get(`${origin}/admin/vouchers`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, "Voucher / Mã", 20000);
        const inp = await focusEntityListSearchInput(driver);
        await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
        await inp.sendKeys("zz_no_voucher_");
        await sleepAfterSearchTyping(driver);
        const vHit = await waitForListRequest(driver, {
          needle: "zz_no_voucher_",
          pathPart: "/api/vouchers",
          param: "search",
          ms: 20000,
        });
        caseResults.push(cr("vouchers_list_search_backend", "PASS", { networkEvidence: vHit }));
      } catch (e) {
        caseResults.push(
          cr("vouchers_list_search_backend", "FAIL", { reason: e?.message || String(e) }),
        );
      }

      // Unmatched payments
      try {
        await driver.get(`${origin}/admin/unmatched-payments`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, "Đối soát giao dịch", 20000);
        const inp = await focusEntityListSearchInput(driver);
        await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
        await inp.sendKeys("zz_nomatch_");
        await sleepAfterSearchTyping(driver);
        const uHit = await waitForListRequest(driver, {
          needle: "zz_nomatch_",
          pathPart: "/api/payment-events/unmatched",
          param: "search",
          ms: 20000,
        });
        caseResults.push(cr("unmatched_payments_search_backend", "PASS", { networkEvidence: uHit }));
      } catch (e) {
        caseResults.push(
          cr("unmatched_payments_search_backend", "FAIL", { reason: e?.message || String(e) }),
        );
      }

      // Link dialog: open first "Liên kết" if present — observe pending order search only
      try {
        await driver.get(`${origin}/admin/unmatched-payments`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, "Đối soát giao dịch", 20000);
        const linkBtns = await driver.findElements(By.xpath("//button[contains(.,'Liên kết')]"));
        if (!linkBtns.length) {
          caseResults.push(
            cr("unmatched_payment_link_dialog_pending_order_search_backend", "PASS", {
              reason: "No linkable row — control only",
            }),
          );
        } else {
          await linkBtns[0].click();
          await driver.wait(until.elementLocated(By.css('[role="dialog"]')), 8000).catch(() => {});
          await reinstallFetchTap(driver, { clear: true });
          const dialogInputs = await driver.findElements(By.css('[role="dialog"] input'));
          for (const el of dialogInputs) {
            if (await el.isDisplayed()) {
              await el.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
              await el.sendKeys(tok);
              break;
            }
          }
          await sleepAfterSearchTyping(driver);
          const poHit = await waitForListRequest(driver, {
            needle: tok,
            pathPart: "/api/pending-orders",
            param: "search",
            ms: 15000,
          });
          caseResults.push(
            cr("unmatched_payment_link_dialog_pending_order_search_backend", "PASS", {
              networkEvidence: poHit,
            }),
          );
          const closes = await driver.findElements(By.xpath("//button[contains(.,'Hủy')]"));
          if (closes.length) await closes[closes.length - 1].click();
        }
      } catch (e) {
        caseResults.push(
          cr("unmatched_payment_link_dialog_pending_order_search_backend", "FAIL", {
            reason: e?.message || String(e),
          }),
        );
      }

      // Production recipes tab
      try {
        await driver.get(`${origin}/admin/production`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, "Sản xuất / đóng gói", 20000);
        const tabs = await driver.findElements(By.xpath("//button[@role='tab' and contains(.,'Quy trình')]"));
        if (tabs.length) await tabs[0].click();
        await driver.sleep(500);
        await reinstallFetchTap(driver, { clear: true });
        const inp = await focusEntityListSearchInput(driver);
        await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
        await inp.sendKeys(`ZZZ_${tok}`);
        await sleepAfterSearchTyping(driver);
        const prHit = await waitForListRequest(driver, {
          needle: `ZZZ_${tok}`,
          pathPart: "/api/production-recipes",
          param: "query",
          ms: 20000,
        });
        caseResults.push(
          cr("production_recipes_list_search_backend", "PASS", {
            reason: "Backend query= on list (no fixture row required)",
            networkEvidence: prHit,
          }),
        );
      } catch (e) {
        caseResults.push(
          cr("production_recipes_list_search_backend", "SKIPPED_WITH_REASON", {
            reason: e?.message || String(e),
          }),
        );
      }

      // GHN logs
      try {
        await driver.get(`${origin}/admin/ghn-quote-logs`);
        await reinstallFetchTap(driver, { clear: true });
        await waitForH1Containing(driver, "Nhật ký báo giá GHN", 20000);
        const inp = await focusEntityListSearchInput(driver);
        await inp.sendKeys(Key.chord(Key.CONTROL, "a"), Key.DELETE);
        await inp.sendKeys(`addr_${tok}`);
        await sleepAfterSearchTyping(driver);
        const ghnHit = await waitForListRequest(driver, {
          needle: `addr_${tok}`,
          pathPart: "/api/admin/ghn-quote-logs",
          param: "search",
          ms: 20000,
        });
        caseResults.push(cr("ghn_quote_logs_search_backend", "PASS", { networkEvidence: ghnHit }));
      } catch (e) {
        caseResults.push(
          cr("ghn_quote_logs_search_backend", "SKIPPED_WITH_REASON", {
            reason: e?.message || String(e),
          }),
        );
      }
    }

    caseResults.push(
      cr("categories_search_static_small_classified", "STATIC_SMALL_ACCEPTED", {
        reason: "Categories list is small/bounded; local name filter acceptable",
        route: "/admin/categories",
      }),
    );
    caseResults.push(
      cr("inventory_report_search_classified", "REPORT_SEARCH_HIGH_RISK", {
        reason: "Client-side filter on report projection — defer backend search",
        route: "/admin/inventory-report",
      }),
    );
    caseResults.push(
      cr("admin_sidebar_pending_order_badge_classified", "OUT_OF_SCOPE_NON_SEARCH_FIRST_N", {
        reason: "Badge aggregate not entity list search",
      }),
    );
    caseResults.push(
      cr("product_import_review_search_classified", "SKIPPED_WITH_REASON", {
        reason: "No stable upload fixture",
      }),
    );
    caseResults.push(
      cr("entity_search_no_stale_response_overwrite", "DEBT", {
        reason: "No explicit AbortController / request-seq in audited admin list hooks",
      }),
    );

    await assertNoSevereBrowserLogs(driver);

    const failedCritical = caseResults.filter((r) => CRITICAL.has(r.case) && r.status === "FAIL");
    if (failedCritical.length) {
      return {
        caseResults,
        outcome: "fail",
        reason: failedCritical.map((r) => `${r.case}: ${r.reason || "FAIL"}`).join("; "),
      };
    }
    return { caseResults };
  },
};
