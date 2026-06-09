import { pickSellableVariantScan } from "../helpers/adminSales.mjs";

const STD_ADDR = Object.freeze({
  receiverName: "BT Pending Quote",
  phone: "0912345678",
  provinceCode: "79",
  provinceName: "Ho Chi Minh",
  districtCode: "1442",
  districtName: "Quan 1",
  wardCode: "21211",
  wardName: "Ben Nghe",
  street: "99 Business Truth",
  note: null,
});

function textFromResponseBody(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  return JSON.stringify(body);
}

async function readJsonOrText(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default {
  name: "Business truth: pending orders require backend quote snapshots",
  tags: ["business-truth", "pending", "api"],
  order: 96,
  async run(_driver, ctx) {
    const u = ctx.config.adminUsername;
    const p = ctx.config.adminPassword;
    if (!u || !p) {
      return { skipped: true, reason: "Set ADMIN_USERNAME and ADMIN_PASSWORD for business-truth pending quote spec" };
    }

    const loginBody = await ctx.api.authLoginJson(u, p);
    ctx.api.setAccessToken(String(loginBody.accessToken));

    const noQuotePayload = {
      customerId: null,
      customerName: `BT-NOQUOTE-${Date.now()}`,
      customerPhone: "0900000000",
      shippingAddress: STD_ADDR,
      note: "business truth no quote",
      paymentMethod: "cod",
      lines: [],
      promotionSnapshot: null,
      voucherSnapshot: null,
      shippingQuoteSnapshot: { provider: "malicious", fee: 1 },
      pricingBreakdownSnapshot: { subtotal: 1, total: 1, lineCount: 1 },
      expiresAt: null,
      quotePublicId: null,
    };

    const noQuoteRes = await ctx.api.fetch("/api/pending-orders", {
      method: "POST",
      json: noQuotePayload,
    });
    const noQuoteBody = await readJsonOrText(noQuoteRes);
    if (noQuoteRes.status !== 400) {
      throw new Error(`Expected authenticated no-quote pending order to return 400, got ${noQuoteRes.status}`);
    }
    if (!textFromResponseBody(noQuoteBody).includes("quotePublicId")) {
      throw new Error(`Expected no-quote error to mention quotePublicId, got ${textFromResponseBody(noQuoteBody)}`);
    }

    const projections = await ctx.api.fetchJson("/api/inventory/projections");
    const pick = Array.isArray(projections) ? pickSellableVariantScan(projections) : null;
    if (!pick?.productId || !pick?.variantId) {
      return { skipped: true, reason: "No sellable projection line for quote-backed pending spoof check" };
    }

    const quoteReq = {
      source: "storefront",
      customerId: null,
      promotionId: null,
      voucherCode: null,
      shippingQuoteSnapshot: null,
      manualDiscount: null,
      requestedRedeemPoints: null,
      vatPercent: 0,
      lines: [{
        productId: pick.productId,
        variantId: pick.variantId,
        quantity: 1,
        discountPercent: 0,
        batchId: null,
        rewardLine: false,
      }],
      shippingAddress: STD_ADDR,
    };
    const quote = await ctx.api.fetchJson("/api/sales/quote", { method: "POST", json: quoteReq });
    const quoteId = String(quote.quoteId ?? quote.quotePublicId);
    const backendTotal = Number(quote.pricingBreakdownSnapshot?.total ?? quote.total ?? 0);
    if (!quoteId || !Number.isFinite(backendTotal) || backendTotal <= 1) {
      throw new Error(`Quote fixture invalid: quoteId=${quoteId}, total=${backendTotal}`);
    }

    const spoofPayload = {
      customerId: null,
      customerName: `BT-SPOOF-${Date.now()}`,
      customerPhone: "0900000001",
      shippingAddress: STD_ADDR,
      note: "business truth spoof",
      paymentMethod: "cod",
      lines: [{
        lineId: "fake",
        productId: String(pick.productId),
        variantId: String(pick.variantId),
        productName: "fake product",
        variantName: "fake variant",
        quantity: 1,
        unitPrice: 1,
        lineSubtotal: 1,
      }],
      promotionSnapshot: null,
      voucherSnapshot: null,
      shippingQuoteSnapshot: { provider: "malicious", fee: 1 },
      pricingBreakdownSnapshot: { subtotal: 1, total: 1, lineCount: 1 },
      expiresAt: null,
      quotePublicId: quoteId,
    };
    const pending = await ctx.api.fetchJson("/api/pending-orders", { method: "POST", json: spoofPayload });
    const pendingId = Number(pending.id);
    if (Number.isFinite(pendingId)) {
      ctx.seed.registerCleanup(async () => {
        await ctx.api.fetch(`/api/pending-orders/${pendingId}/cancel`, {
          method: "POST",
          json: { reason: "business truth automation cleanup" },
        });
      });
    }

    const pendingTotal = Number(pending.totalAmount ?? pending.pricingBreakdownSnapshot?.total ?? 0);
    if (pendingTotal !== backendTotal) {
      throw new Error(`Pending total used client spoof value: expected backend quote ${backendTotal}, got ${pendingTotal}`);
    }
  },
};
