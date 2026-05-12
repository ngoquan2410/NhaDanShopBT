import { describe, expect, it } from "vitest";
import { AdminApiError } from "@/services/auth/adminApi";
import type { GoodsReceipt } from "@/services/types";
import {
  conflictCodeFromAdminError,
  deriveReceiptUiState,
  isDownstreamConsumptionConflict,
  isReceiptVoided,
  RECEIPT_BLOCK_DOWNSTREAM,
} from "./receiptUiState";

function gr(partial: Partial<GoodsReceipt> & Pick<GoodsReceipt, "id" | "number">): GoodsReceipt {
  return {
    id: partial.id,
    number: partial.number,
    date: partial.date ?? "2026-01-01",
    status: partial.status ?? "confirmed",
    supplierId: partial.supplierId ?? "0",
    supplierName: partial.supplierName ?? "",
    itemCount: partial.itemCount ?? 0,
    subtotal: partial.subtotal ?? 0,
    shippingFee: partial.shippingFee ?? 0,
    vat: partial.vat ?? 0,
    totalCost: partial.totalCost ?? 0,
    canDelete: partial.canDelete ?? true,
    ...partial,
  };
}

describe("deriveReceiptUiState", () => {
  it("VOIDED when status voided", () => {
    expect(deriveReceiptUiState(gr({ id: "1", number: "A", status: "voided", canDelete: false }))).toBe("VOIDED");
  });

  it("VOIDED when voidedAt set", () => {
    expect(
      deriveReceiptUiState(
        gr({
          id: "1",
          number: "A",
          status: "confirmed",
          canDelete: false,
          deleteBlockReason: RECEIPT_BLOCK_DOWNSTREAM,
          voidedAt: "2026-05-01T10:00:00",
        }),
      ),
    ).toBe("VOIDED");
  });

  it("CONFIRMED_DOWNSTREAM_BLOCKED", () => {
    expect(
      deriveReceiptUiState(
        gr({
          id: "1",
          number: "A",
          canDelete: false,
          deleteBlockReason: RECEIPT_BLOCK_DOWNSTREAM,
        }),
      ),
    ).toBe("CONFIRMED_DOWNSTREAM_BLOCKED");
  });

  it("CONFIRMED_DELETE_ALLOWED", () => {
    expect(deriveReceiptUiState(gr({ id: "1", number: "A", canDelete: true }))).toBe("CONFIRMED_DELETE_ALLOWED");
  });
});

describe("conflictCodeFromAdminError", () => {
  it("reads ProblemDetail code", () => {
    const e = new AdminApiError("x", 409, { detail: "msg", code: RECEIPT_BLOCK_DOWNSTREAM });
    expect(conflictCodeFromAdminError(e)).toBe(RECEIPT_BLOCK_DOWNSTREAM);
    expect(isDownstreamConsumptionConflict(e)).toBe(true);
  });
});

describe("isReceiptVoided", () => {
  it("true when voidedAt present", () => {
    expect(isReceiptVoided(gr({ id: "1", number: "A", voidedAt: "2026-01-01T00:00:00" }))).toBe(true);
  });
});
