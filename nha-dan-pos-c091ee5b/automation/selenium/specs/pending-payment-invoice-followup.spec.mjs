import { By, until } from "selenium-webdriver";
import { pickSellableVariantScan } from "../helpers/adminSales.mjs";

const STD_ADDR = {
  receiverName: "PPF Gate",
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

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
}

function pass(name, extra = {}) {
  return { caseId: name, outcome: "pass", ...extra };
}

function fail(name, error) {
  return { caseId: name, outcome: "fail", error: error?.message || String(error) };
}

async function seedQuoteAndPending(api, pick, paymentMethod, name) {
  const prevTok = api.getAccessToken();
  api.setAccessToken(null);
  try {
    const line = {
      productId: pick.productId,
      variantId: pick.variantId,
      quantity: 1,
      discountPercent: 0,
      batchId: null,
      rewardLine: false,
    };
    const quote = await api.fetchJson("/api/sales/quote", {
      method: "POST",
      json: {
        source: "storefront",
        customerId: null,
        promotionId: null,
        voucherCode: null,
        shippingQuoteSnapshot: null,
        manualDiscount: null,
        requestedRedeemPoints: null,
        vatPercent: 0,
        lines: [line],
        shippingAddress: STD_ADDR,
      },
    });
    const quotePublicId = String(quote.quoteId ?? quote.quotePublicId);
    const pending = await api.fetchJson("/api/pending-orders", {
      method: "POST",
      json: {
        customerId: null,
        customerName: name,
        customerPhone: "0977000111",
        shippingAddress: STD_ADDR,
        note: "pending-payment-invoice-followup",
        paymentMethod,
        lines: null,
        promotionSnapshot: null,
        voucherSnapshot: null,
        shippingQuoteSnapshot: null,
        pricingBreakdownSnapshot: null,
        expiresAt: null,
        quotePublicId,
      },
    });
    return pending;
  } finally {
    api.setAccessToken(prevTok);
  }
}

async function postCassoWebhook(apiOrigin, cassoToken, body) {
  const res = await fetch(`${apiOrigin}/api/webhooks/casso`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Secure-Token": cassoToken,
    },
    body: JSON.stringify(body),
  });
  return res;
}

async function manualLinkLatestUnmatchedToOrder(api, orderCode, amount, tid) {
  // The webhook ingest creates a PaymentEvent with this tid; then admin can link by id.
  const page = await api.fetchJson(`/api/payment-events/unmatched?size=200`);
  const items = Array.isArray(page) ? page : Array.isArray(page?.content) ? page.content : [];
  const ev = items.find((e) => String(e.providerTxId) === String(tid));
  if (!ev?.id) {
    throw new Error(`No PaymentEvent with providerTxId=${tid} after webhook ingest`);
  }
  await api.fetchJson(`/api/payment-events/${ev.id}/link`, {
    method: "POST",
    json: { orderCode },
  });
}

export default {
  name: "Pending Payment + Invoice followup gate (bank guard + PO column + Casso paths)",
  tags: ["pending-payment-invoice-followup"],
  order: 70,
  async run(driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD" };
    }
    const apiOrigin = ctx.config.apiBaseUrl.replace(/\/$/, "");
    const base = ctx.config.baseUrl.replace(/\/$/, "");
    const cassoToken = process.env.CASSO_WEBHOOK_SECURE_TOKEN?.trim();
    if (!cassoToken) {
      throw new Error("CASSO_WEBHOOK_SECURE_TOKEN env not set — Casso cases are mandatory for this gate.");
    }

    const caseResults = [];
    const loginBody = await ctx.api.authLoginJson(u, p);
    const adminTok =
      typeof loginBody.accessToken === "string" ? loginBody.accessToken : String(loginBody.accessToken);
    ctx.api.setAccessToken(adminTok);

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections) : null;
    if (!pick?.variantCode) {
      ctx.api.setAccessToken(null);
      return { skipped: true, reason: "No sellable projection — cannot seed pending orders" };
    }

    await ctx.auth.loginAsAdmin(driver, ctx.config, { username: u, password: p });

    // ── invoices_show_pending_order_column ────────────────────────────────────
    let firstPo;
    try {
      firstPo = await seedQuoteAndPending(ctx.api, pick, "cod", uid("PPF-COD"));
      ctx.api.setAccessToken(adminTok);
      const confirmRes = await ctx.api.fetchJson(`/api/pending-orders/${firstPo.id}/confirm`, {
        method: "POST",
        json: {},
      });
      const newInvoiceNo = confirmRes?.invoice?.invoiceNo;
      if (!newInvoiceNo) throw new Error("Confirm did not return invoice number");

      // The backend /api/invoices?query= filter matches invoiceNo / customer name (not PO code),
      // so we query by the freshly-created invoice number to land a non-empty page that renders
      // the table (and our column header).
      const invoices = await ctx.api.fetchJson(
        `/api/invoices?query=${encodeURIComponent(newInvoiceNo)}&size=5`,
      );
      const rows = Array.isArray(invoices?.content) ? invoices.content : [];
      const hit = rows.find(
        (r) => r.pendingOrderId === String(firstPo.id) || r.pendingOrderCode === firstPo.code,
      );
      if (!hit) throw new Error("Invoice list missing pendingOrderCode/id for confirmed COD pending");
      if (hit.pendingOrderCode !== firstPo.code) {
        throw new Error(
          `Expected pendingOrderCode=${firstPo.code} on the invoice row; got ${hit.pendingOrderCode}`,
        );
      }

      await driver.navigate().to(`${base}/admin/invoices?q=${encodeURIComponent(newInvoiceNo)}`);
      await driver.wait(
        until.elementLocated(By.css('[data-testid="invoices-col-pending-order"]')),
        15000,
      );
      const headerText = await driver
        .findElement(By.css('[data-testid="invoices-col-pending-order"]'))
        .getText();
      if (!/pending order/i.test(headerText)) {
        throw new Error(`Pending Order header expected; got '${headerText}'`);
      }
      const nguoiTaoNodes = await driver.findElements(
        By.xpath("//table//th[normalize-space()='Người tạo']"),
      );
      if (nguoiTaoNodes.length > 0) {
        throw new Error("Người tạo column still rendered on invoices table");
      }
      // Assert the row carries the PO code link so column wiring is end-to-end verified.
      await driver.wait(
        until.elementLocated(By.xpath(`//td//*[contains(normalize-space(.), '${firstPo.code}')]`)),
        10000,
      );
      caseResults.push(pass("invoices_show_pending_order_column"));
    } catch (e) {
      caseResults.push(fail("invoices_show_pending_order_column", e));
    }

    // ── bank_pending_no_link_disables_confirm ─────────────────────────────────
    let bankNoLink;
    try {
      bankNoLink = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-BNL"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${bankNoLink.id}`);
      if (detail.paymentLinkStatus !== "NONE") {
        throw new Error(`bank no-link expected NONE; got ${detail.paymentLinkStatus}`);
      }
      if (Number(detail.linkedPaymentCount ?? 0) !== 0) {
        throw new Error(`bank no-link expected count 0; got ${detail.linkedPaymentCount}`);
      }
      const confirmRes = await ctx.api.fetch(`/api/pending-orders/${bankNoLink.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (confirmRes.status < 400) {
        throw new Error(`Expected 4xx from confirm; got ${confirmRes.status}`);
      }
      caseResults.push(pass("bank_pending_no_link_disables_confirm"));
    } catch (e) {
      caseResults.push(fail("bank_pending_no_link_disables_confirm", e));
    }

    // ── bank_manual_link_underpaid_disables_confirm ───────────────────────────
    let bankUnder;
    try {
      bankUnder = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-BUN"));
      ctx.api.setAccessToken(adminTok);
      const order = await ctx.api.fetchJson(`/api/pending-orders/${bankUnder.id}`);
      const under = Number(order.totalAmount) - 1;
      const tid = `PPF_UND_${bankUnder.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [{ tid, description: "under stub", amount: String(under), when: "2026-04-24 10:15:30" }],
      });
      await manualLinkLatestUnmatchedToOrder(ctx.api, bankUnder.code, under, tid);
      const after = await ctx.api.fetchJson(`/api/pending-orders/${bankUnder.id}`);
      if (after.paymentLinkStatus !== "UNDERPAID_LINKED") {
        throw new Error(`expected UNDERPAID_LINKED; got ${after.paymentLinkStatus}`);
      }
      const confirmRes = await ctx.api.fetch(`/api/pending-orders/${bankUnder.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (confirmRes.status < 400) {
        throw new Error(`Expected 4xx; got ${confirmRes.status}`);
      }
      caseResults.push(pass("bank_manual_link_underpaid_disables_confirm"));
    } catch (e) {
      caseResults.push(fail("bank_manual_link_underpaid_disables_confirm", e));
    }

    // ── bank_manual_link_exact_enables_confirm ────────────────────────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-BEX"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const tid = `PPF_EX_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [
          { tid, description: "exact stub", amount: String(detail.totalAmount), when: "2026-04-24 10:15:30" },
        ],
      });
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, detail.totalAmount, tid);
      const after = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      if (after.paymentLinkStatus !== "EXACT_PAID") {
        throw new Error(`expected EXACT_PAID; got ${after.paymentLinkStatus}`);
      }
      const confirmRes = await ctx.api.fetchJson(`/api/pending-orders/${po.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (!confirmRes?.invoice?.id) {
        throw new Error("Confirm did not return invoice");
      }
      const total = Number(confirmRes.invoice.totalAmount);
      if (Number(total) !== Number(detail.totalAmount)) {
        throw new Error(
          `Invoice total ${total} should equal pending total ${detail.totalAmount}`,
        );
      }
      caseResults.push(pass("bank_manual_link_exact_enables_confirm"));
    } catch (e) {
      caseResults.push(fail("bank_manual_link_exact_enables_confirm", e));
    }

    // ── bank_manual_link_overpaid_enables_confirm ─────────────────────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-BOV"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const over = Number(detail.totalAmount) + 1;
      const tid = `PPF_OV_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [{ tid, description: "over stub", amount: String(over), when: "2026-04-24 10:15:30" }],
      });
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, over, tid);
      const after = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      if (after.paymentLinkStatus !== "OVERPAID_LINKED") {
        throw new Error(`expected OVERPAID_LINKED; got ${after.paymentLinkStatus}`);
      }
      const confirmRes = await ctx.api.fetchJson(`/api/pending-orders/${po.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (Number(confirmRes.invoice.totalAmount) !== Number(detail.totalAmount)) {
        throw new Error("Invoice total should equal pending total even when aggregate overpaid");
      }
      caseResults.push(pass("bank_manual_link_overpaid_enables_confirm"));
    } catch (e) {
      caseResults.push(fail("bank_manual_link_overpaid_enables_confirm", e));
    }

    // ── bank_multiple_links_underpaid_still_disabled ──────────────────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-MUN"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const total = Number(detail.totalAmount);
      const a = Math.floor(total / 3);
      const b = Math.floor(total / 3);
      const tidA = `PPF_MUN_A_${po.id}`;
      const tidB = `PPF_MUN_B_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [
          { tid: tidA, description: "mu a", amount: String(a), when: "2026-04-24 10:15:30" },
          { tid: tidB, description: "mu b", amount: String(b), when: "2026-04-24 10:16:30" },
        ],
      });
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, a, tidA);
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, b, tidB);
      const after = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      if (Number(after.linkedPaymentCount) !== 2) {
        throw new Error(`expected count 2; got ${after.linkedPaymentCount}`);
      }
      const confirmRes = await ctx.api.fetch(`/api/pending-orders/${po.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (confirmRes.status < 400) {
        throw new Error(`Expected 4xx for multi-underpaid; got ${confirmRes.status}`);
      }
      caseResults.push(pass("bank_multiple_links_underpaid_still_disabled"));
    } catch (e) {
      caseResults.push(fail("bank_multiple_links_underpaid_still_disabled", e));
    }

    // ── bank_multiple_links_exact_enables_confirm ─────────────────────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-MEX"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const total = Number(detail.totalAmount);
      const a = Math.floor(total / 2);
      const b = total - a;
      const tidA = `PPF_MEX_A_${po.id}`;
      const tidB = `PPF_MEX_B_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [
          { tid: tidA, description: "mx a", amount: String(a), when: "2026-04-24 10:15:30" },
          { tid: tidB, description: "mx b", amount: String(b), when: "2026-04-24 10:16:30" },
        ],
      });
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, a, tidA);
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, b, tidB);
      const confirmRes = await ctx.api.fetchJson(`/api/pending-orders/${po.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (Number(confirmRes.invoice.totalAmount) !== total) {
        throw new Error("Invoice total for multi-exact must equal pending total");
      }
      caseResults.push(pass("bank_multiple_links_exact_enables_confirm"));
    } catch (e) {
      caseResults.push(fail("bank_multiple_links_exact_enables_confirm", e));
    }

    // ── bank_multiple_links_overpaid_enables_confirm ──────────────────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-MOV"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const total = Number(detail.totalAmount);
      const a = total;
      const b = 1000;
      const tidA = `PPF_MOV_A_${po.id}`;
      const tidB = `PPF_MOV_B_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [
          { tid: tidA, description: "mo a", amount: String(a), when: "2026-04-24 10:15:30" },
          { tid: tidB, description: "mo b", amount: String(b), when: "2026-04-24 10:16:30" },
        ],
      });
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, a, tidA);
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, b, tidB);
      const confirmRes = await ctx.api.fetchJson(`/api/pending-orders/${po.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (Number(confirmRes.invoice.totalAmount) !== total) {
        throw new Error("Invoice total for multi-overpaid must equal pending total");
      }
      caseResults.push(pass("bank_multiple_links_overpaid_enables_confirm"));
    } catch (e) {
      caseResults.push(fail("bank_multiple_links_overpaid_enables_confirm", e));
    }

    // ── Non-bank confirm enabled without link ─────────────────────────────────
    for (const [caseName, method] of [
      ["cod_confirm_not_disabled_without_link", "cod"],
      ["momo_confirm_not_disabled_without_link", "momo"],
      ["zalopay_confirm_not_disabled_without_link", "zalopay"],
    ]) {
      try {
        const po = await seedQuoteAndPending(ctx.api, pick, method, uid(`PPF-${method.toUpperCase()}`));
        ctx.api.setAccessToken(adminTok);
        const resp = await ctx.api.fetchJson(`/api/pending-orders/${po.id}/confirm`, {
          method: "POST",
          json: {},
        });
        if (!resp?.invoice?.id) throw new Error(`${method} confirm did not return invoice`);
        caseResults.push(pass(caseName));
      } catch (e) {
        caseResults.push(fail(caseName, e));
      }
    }

    // ── Casso exact webhook auto-confirms (server-side flow only) ────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-CEX"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const tid = `PPF_CASSO_EX_${po.id}`;
      const res = await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [
          {
            tid,
            description: `CK ${po.code}`,
            amount: String(detail.totalAmount),
            when: "2026-04-24 10:15:30",
          },
        ],
      });
      if (!res.ok) throw new Error(`Casso webhook returned HTTP ${res.status}`);
      const after = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      if (after.status !== "confirmed" || !after.invoice?.id) {
        throw new Error(
          `Expected confirmed + invoice after Casso exact; got status=${after.status} invoice=${after.invoice?.id ?? "null"}`,
        );
      }
      caseResults.push(pass("casso_exact_webhook_auto_confirms"));
    } catch (e) {
      caseResults.push(fail("casso_exact_webhook_auto_confirms", e));
    }

    // ── Casso underpaid requires manual link ─────────────────────────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-CU"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const under = Number(detail.totalAmount) - 500;
      const tid = `PPF_CASSO_U_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [
          { tid, description: `CK ${po.code}`, amount: String(under), when: "2026-04-24 10:15:30" },
        ],
      });
      const after = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      if (after.status === "confirmed") throw new Error("Underpaid Casso should not auto-confirm");

      // Manual top-up to reach total then confirm
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, under, tid);
      const remainder = Number(detail.totalAmount) - under;
      const tidB = `PPF_CASSO_U_TOP_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [{ tid: tidB, description: "topup", amount: String(remainder), when: "2026-04-24 10:16:30" }],
      });
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, remainder, tidB);
      const confirmRes = await ctx.api.fetchJson(`/api/pending-orders/${po.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (!confirmRes?.invoice?.id) throw new Error("Confirm did not produce invoice");
      caseResults.push(pass("casso_underpaid_requires_manual_link_before_confirm"));
    } catch (e) {
      caseResults.push(fail("casso_underpaid_requires_manual_link_before_confirm", e));
    }

    // ── Casso overpaid requires manual link ──────────────────────────────────
    try {
      const po = await seedQuoteAndPending(ctx.api, pick, "bank_transfer", uid("PPF-CO"));
      ctx.api.setAccessToken(adminTok);
      const detail = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      const over = Number(detail.totalAmount) + 700;
      const tid = `PPF_CASSO_O_${po.id}`;
      await postCassoWebhook(apiOrigin, cassoToken, {
        error: 0,
        data: [
          { tid, description: `CK ${po.code}`, amount: String(over), when: "2026-04-24 10:15:30" },
        ],
      });
      const after = await ctx.api.fetchJson(`/api/pending-orders/${po.id}`);
      if (after.status === "confirmed") throw new Error("Overpaid Casso should not auto-confirm");
      await manualLinkLatestUnmatchedToOrder(ctx.api, po.code, over, tid);
      const confirmRes = await ctx.api.fetchJson(`/api/pending-orders/${po.id}/confirm`, {
        method: "POST",
        json: {},
      });
      if (Number(confirmRes.invoice.totalAmount) !== Number(detail.totalAmount)) {
        throw new Error("Confirmed invoice total must equal pending total after Casso overpay manual link");
      }
      caseResults.push(pass("casso_overpaid_requires_manual_link_before_confirm"));
    } catch (e) {
      caseResults.push(fail("casso_overpaid_requires_manual_link_before_confirm", e));
    }

    ctx.api.setAccessToken(null);
    const fails = caseResults.filter((c) => c.outcome === "fail");
    if (fails.length > 0) {
      const summary = fails.map((c) => `${c.caseId}: ${c.error}`).join("\n");
      throw new Error(`pending-payment-invoice-followup failures:\n${summary}`);
    }
    return { caseResults };
  },
};
