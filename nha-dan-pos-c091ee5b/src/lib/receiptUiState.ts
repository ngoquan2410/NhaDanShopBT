import { AdminApiError } from "@/services/auth/adminApi";
import type { GoodsReceipt } from "@/services/types";

/** Mirrors backend {@link ReceiptDeleteEligibility} reason strings. */
export const RECEIPT_BLOCK_DOWNSTREAM = "downstream_consumption";
export const RECEIPT_BLOCK_VOIDED = "voided";
export const RECEIPT_CODE_ALREADY_VOIDED = "already_voided";

export type ReceiptUiState =
  | "CONFIRMED_DELETE_ALLOWED"
  | "CONFIRMED_DOWNSTREAM_BLOCKED"
  | "VOIDED"
  | "CONFIRMED_OTHER_DELETE_BLOCKED"
  | "UNKNOWN_ERROR_STATE";

export function isReceiptVoided(receipt: GoodsReceipt): boolean {
  return receipt.status === "voided" || receipt.voidedAt != null;
}

export function deriveReceiptUiState(receipt: GoodsReceipt): ReceiptUiState {
  const voided = isReceiptVoided(receipt);
  if (voided) return "VOIDED";
  if (receipt.canDelete) {
    const reason = receipt.deleteBlockReason?.trim();
    if (!reason) return "CONFIRMED_DELETE_ALLOWED";
    return "UNKNOWN_ERROR_STATE";
  }
  const reason = receipt.deleteBlockReason?.trim();
  if (reason === RECEIPT_BLOCK_DOWNSTREAM) return "CONFIRMED_DOWNSTREAM_BLOCKED";
  if (reason) return "CONFIRMED_OTHER_DELETE_BLOCKED";
  return "UNKNOWN_ERROR_STATE";
}

/** RFC7807 ProblemDetail from Spring: optional `code` on BusinessConflictException. */
export function conflictCodeFromAdminError(e: unknown): string | undefined {
  if (!(e instanceof AdminApiError)) return undefined;
  const d = e.data;
  if (d && typeof d === "object" && "code" in d) {
    const c = (d as { code?: unknown }).code;
    return c != null && String(c).length > 0 ? String(c) : undefined;
  }
  return undefined;
}

export function isDownstreamConsumptionConflict(e: unknown): boolean {
  return conflictCodeFromAdminError(e) === RECEIPT_BLOCK_DOWNSTREAM;
}

export function isVoidedDeleteConflict(e: unknown): boolean {
  const c = conflictCodeFromAdminError(e);
  return c === RECEIPT_BLOCK_VOIDED || c === RECEIPT_CODE_ALREADY_VOIDED;
}
