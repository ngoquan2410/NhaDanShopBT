package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.Voucher;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDateTime;

/**
 * Resolves {@link Voucher} rows into raw invoice-level discount amounts for {@link CommercialPricingEngine}.
 */
public final class VoucherQuoteEvaluator {

    public record RawVoucherDiscounts(BigDecimal voucherDiscount, BigDecimal shippingDiscount) {}

    private VoucherQuoteEvaluator() {}

    public static void assertEligibleOrThrow(Voucher v, String codeUsed, Clock clock) {
        if (!Boolean.TRUE.equals(v.getActive())) {
            throw new IllegalArgumentException("Voucher khong hoat dong: " + codeUsed);
        }
        LocalDateTime now = LocalDateTime.now(clock);
        if (v.getStartAt() != null && now.isBefore(v.getStartAt())) {
            throw new IllegalArgumentException("Voucher chua co hieu luc: " + codeUsed);
        }
        if (v.getEndAt() != null && now.isAfter(v.getEndAt())) {
            throw new IllegalArgumentException("Voucher da het han: " + codeUsed);
        }
    }

    /**
     * @param merchandiseSubtotal billable line subtotals before manual/promotion/voucher (S in engine)
     * @param shippingFee         quoted shipping fee (>= 0)
     */
    public static RawVoucherDiscounts computeRawDiscounts(
            Voucher v,
            BigDecimal merchandiseSubtotal,
            BigDecimal shippingFee,
            String codeUsed
    ) {
        BigDecimal S = nz(merchandiseSubtotal);
        BigDecimal minSub = nz(v.getMinSubtotal());
        if (S.compareTo(minSub) < 0) {
            throw new IllegalArgumentException(
                    "Don chua dat gia tri toi thieu voucher " + codeUsed + " (can >= " + minSub.toPlainString() + ")");
        }

        boolean freeShip = Boolean.TRUE.equals(v.getFreeShipping());
        BigDecimal pct = nz(v.getPercent());
        BigDecimal fixed = nz(v.getFixedAmount());
        BigDecimal cap = nz(v.getCap());

        if (freeShip && (pct.compareTo(BigDecimal.ZERO) > 0 || fixed.compareTo(BigDecimal.ZERO) > 0)) {
            throw new IllegalArgumentException("Voucher " + codeUsed + " — free_shipping khong ket hop voi giam tien hang");
        }
        if (pct.compareTo(BigDecimal.ZERO) > 0 && fixed.compareTo(BigDecimal.ZERO) > 0) {
            throw new IllegalArgumentException("Voucher " + codeUsed + " — chon percent hoac fixed_amount, khong ca hai");
        }

        BigDecimal sf = nz(shippingFee).max(BigDecimal.ZERO);

        if (freeShip) {
            if (sf.compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException("Voucher free ship " + codeUsed + " — khong co phi van chuyen de giam");
            }
            BigDecimal shipDisc = cap.compareTo(BigDecimal.ZERO) > 0 ? cap.min(sf) : sf;
            if (shipDisc.compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException("Voucher " + codeUsed + " — khong ap dung duoc (giam phi = 0)");
            }
            return new RawVoucherDiscounts(BigDecimal.ZERO, shipDisc);
        }

        if (pct.compareTo(BigDecimal.ZERO) > 0) {
            if (pct.compareTo(new BigDecimal("100")) > 0) {
                throw new IllegalArgumentException("Voucher " + codeUsed + " — percent khong hop le");
            }
            BigDecimal raw = S.multiply(pct)
                    .divide(BigDecimal.valueOf(100), 0, RoundingMode.FLOOR);
            if (cap.compareTo(BigDecimal.ZERO) > 0) {
                raw = raw.min(cap);
            }
            if (raw.compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException("Voucher " + codeUsed + " — giam gia bang 0 voi gio hang hien tai");
            }
            return new RawVoucherDiscounts(raw, BigDecimal.ZERO);
        }

        if (fixed.compareTo(BigDecimal.ZERO) > 0) {
            return new RawVoucherDiscounts(fixed, BigDecimal.ZERO);
        }

        throw new IllegalArgumentException("Voucher " + codeUsed + " — chua cau hinh giam gia hop le");
    }

    private static BigDecimal nz(BigDecimal x) {
        return x == null ? BigDecimal.ZERO : x;
    }
}
