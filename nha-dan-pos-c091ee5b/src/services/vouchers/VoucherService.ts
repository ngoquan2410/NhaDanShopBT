import type { CartContext, Money, VoucherSnapshot } from "@/services/types";

/** Outcome of validating a voucher code against a cart context. */
export interface VoucherValidationResult {
  valid: boolean;
  /** Populated when valid — ready to persist into a PendingOrder. */
  snapshot?: VoucherSnapshot;
  /** Populated when invalid — UI-friendly Vietnamese reason. */
  reasonIfInvalid?: string;
}

/**
 * Voucher service contract.
 *
 * Local adapter ships a few hard-coded codes (NHADAN10, FREESHIP50K…) so the
 * storefront has something to validate against today. When the EC2 backend
 * lands, only the adapter wiring in `services/index.ts` changes.
 */
export interface VoucherService {
  validate(code: string, ctx: CartContext): Promise<VoucherValidationResult>;
}

/** Helper used by adapters when computing a percent-off discount. */
export function computePercentOff(subtotal: Money, percent: number, cap?: Money): Money {
  const raw = Math.floor((subtotal * percent) / 100);
  return cap ? Math.min(raw, cap) : raw;
}
