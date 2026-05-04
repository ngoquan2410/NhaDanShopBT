import { adminFetchJson } from "@/services/auth/adminApi";
import type { CartContext } from "@/services/types";
import type { VoucherService, VoucherValidationResult } from "@/services/vouchers/VoucherService";

type VoucherResponse = {
  code?: string;
  name?: string;
  type?: string;
  discountType?: string;
  discountValue?: number;
  maxDiscount?: number;
  minOrderValue?: number;
  active?: boolean;
};

export class BackendVoucherAdapter implements VoucherService {
  async validate(rawCode: string, ctx: CartContext): Promise<VoucherValidationResult> {
    const code = rawCode.trim().toUpperCase();
    if (!code) return { valid: false, reasonIfInvalid: "Vui lòng nhập mã voucher" };

    const rows = await adminFetchJson<VoucherResponse[]>("/api/vouchers/active");
    const voucher = rows.find((v) => String(v.code ?? "").toUpperCase() === code);
    if (!voucher) return { valid: false, reasonIfInvalid: "Voucher không tồn tại hoặc đã ngưng" };
    if (Number(voucher.minOrderValue ?? 0) > ctx.subtotal) {
      return { valid: false, reasonIfInvalid: "Đơn hàng chưa đạt giá trị tối thiểu" };
    }

    return {
      valid: true,
      snapshot: {
        code,
        ruleSummary: voucher.name ?? code,
        discountAmount: 0,
        shippingDiscountAmount: 0,
      },
    };
  }
}
