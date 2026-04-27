// Local voucher adapter — reads voucher definitions from the runtime store
// (`src/lib/vouchers-store.ts`), which the Admin Vouchers page edits. When
// vouchers move to a real backend, swap this implementation only.

import type {
  VoucherService,
  VoucherValidationResult,
} from "@/services/vouchers/VoucherService";
import { computePercentOff } from "@/services/vouchers/VoucherService";
import type { CartContext, Money, VoucherSnapshot } from "@/services/types";
import { findVoucherByCode, isWithinActiveWindow } from "@/lib/vouchers-store";

export class LocalVoucherAdapter implements VoucherService {
  async validate(rawCode: string, ctx: CartContext): Promise<VoucherValidationResult> {
    const code = rawCode.trim().toUpperCase();
    if (!code) return { valid: false, reasonIfInvalid: "Vui lòng nhập mã giảm giá" };

    const def = findVoucherByCode(code);
    if (!def) return { valid: false, reasonIfInvalid: "Mã giảm giá không hợp lệ" };
    if (!def.active) return { valid: false, reasonIfInvalid: "Mã giảm giá đã ngừng áp dụng" };
    if (!isWithinActiveWindow(def)) {
      return { valid: false, reasonIfInvalid: "Mã giảm giá không nằm trong thời gian áp dụng" };
    }

    if (def.minSubtotal > 0 && ctx.subtotal < def.minSubtotal) {
      return {
        valid: false,
        reasonIfInvalid: `Đơn tối thiểu ${def.minSubtotal.toLocaleString("vi-VN")}đ để dùng mã này`,
      };
    }

    // Voucher freeship: không giảm subtotal — chỉ flag shippingDiscountAmount
    // (cap). Checkout sẽ Math.min(cap, baseShippingFee) để tính số tiền giảm
    // ship thực tế cho đơn.
    if (def.freeShipping) {
      const shippingCap = def.cap > 0 ? def.cap : 1_000_000;
      const snapshot: VoucherSnapshot = {
        code: def.code,
        ruleSummary: def.ruleSummary,
        discountAmount: 0,
        shippingDiscountAmount: shippingCap,
      };
      return { valid: true, snapshot };
    }

    let raw: Money = 0;
    if (def.percent > 0) {
      raw = computePercentOff(ctx.subtotal, def.percent, def.cap > 0 ? def.cap : undefined);
    } else {
      raw = def.fixedAmount;
    }
    const discount = Math.max(0, Math.min(raw, ctx.subtotal));
    if (discount <= 0) {
      return { valid: false, reasonIfInvalid: "Mã không tạo ra giảm giá nào cho đơn hiện tại" };
    }

    const snapshot: VoucherSnapshot = {
      code: def.code,
      ruleSummary: def.ruleSummary,
      discountAmount: discount,
    };
    return { valid: true, snapshot };
  }
}
