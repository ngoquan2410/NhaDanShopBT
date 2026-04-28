package com.example.nhadanshop.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional
public class SalesQuoteService {

    private static final int QUOTE_TTL_MINUTES = 30;

    private final ProductRepository productRepo;
    private final ProductVariantService variantService;
    private final ProductVariantRepository variantRepo;
    private final PromotionRepository promotionRepository;
    private final ProductBatchRepository batchRepo;
    private final SalesQuoteRepository salesQuoteRepository;
    private final VoucherRepository voucherRepository;
    private final ShippingQuoteService shippingQuoteService;
    private final ObjectMapper objectMapper;
    private final Clock clock;

    public SalesQuoteResponse quote(SalesQuoteRequest req) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean anonymous = auth == null || !auth.isAuthenticated()
                || auth.getName() == null
                || "anonymousUser".equalsIgnoreCase(auth.getName());
        String src = req.source() != null ? req.source().trim().toLowerCase(Locale.ROOT) : "";

        if (anonymous && !"storefront".equals(src)) {
            throw new IllegalArgumentException("Goi quote anonymous chi ho tro source=storefront");
        }
        if ("storefront".equals(src)) {
            if (req.manualDiscount() != null && req.manualDiscount().compareTo(BigDecimal.ZERO) > 0) {
                throw new IllegalArgumentException("Cua hang web khong duoc giam gia thu cong tren quote");
            }
        }

        String voucherCode = req.voucherCode() != null ? req.voucherCode().trim() : "";

        Promotion promo = null;
        if (req.promotionId() != null) {
            promo = promotionRepository.findById(req.promotionId()).orElse(null);
            if (promo == null || !promo.isCurrentlyActive()) {
                throw new IllegalArgumentException("Chuong trinh khuyen mai khong ton tai hoac da het han");
            }
            assertQuoteSupportedPromotionType(promo);
        }

        BigDecimal merchandiseSubtotal = BigDecimal.ZERO;
        List<SalesQuoteCapturedLineDto> capturedBillable = new ArrayList<>();
        List<SalesQuoteCapturedLineDto> capturedRewards = new ArrayList<>();
        List<CommercialPricingEngine.PromoPricingLine> promoLines = new ArrayList<>();

        for (SalesQuoteLineRequest line : req.lines()) {
            if (line.rewardLine()) {
                throw new IllegalArgumentException("Khong gui rewardLine tu client — tang qua chi do backend tao");
            }
            Product product = productRepo.findById(line.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Khong tim thay san pham ID: " + line.productId()));
            if (!product.getActive()) {
                throw new IllegalArgumentException("San pham '" + product.getName() + "' da ngung kinh doanh");
            }
            if (product.isCombo()) {
                throw new IllegalArgumentException("Quote combo — su dung catalog combo rieng / Slice sau.");
            }

            ProductVariant variant = variantService.resolveVariant(line.variantId(), product.getId(), true);
            variantRepo.findById(variant.getId()).orElseThrow();
            if (!Boolean.TRUE.equals(variant.getActive())) {
                throw new IllegalArgumentException("Variant '" + variant.getVariantCode() + "' khong hoat dong");
            }
            if (!Boolean.TRUE.equals(variant.getIsSellable())) {
                throw new IllegalArgumentException("Variant '" + variant.getVariantCode() + "' khong ban duoc");
            }

            if (line.batchId() != null) {
                ProductBatch batch = batchRepo.findByIdWithVariantAndProduct(line.batchId())
                        .orElseThrow(() -> new EntityNotFoundException("Khong tim thay lo hang batchId=" + line.batchId()));
                if (!batch.getVariant().getId().equals(variant.getId())) {
                    throw new IllegalArgumentException("batchId khong thuoc variant da chon — chi dung trace kho.");
                }
            }

            BigDecimal lineDisc = line.discountPercent() != null ? line.discountPercent() : BigDecimal.ZERO;
            if ("storefront".equals(src) && lineDisc.compareTo(BigDecimal.ZERO) > 0) {
                throw new IllegalArgumentException("Cua hang web khong duoc giam gia theo dong tren quote");
            }

            BigDecimal factor = BigDecimal.ONE.subtract(
                    lineDisc.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal sell = variant.getSellPrice();
            BigDecimal snappedUnit = sell.multiply(factor).setScale(0, RoundingMode.HALF_UP);
            BigDecimal lineSubtotal = snappedUnit.multiply(BigDecimal.valueOf(line.quantity()));

            merchandiseSubtotal = merchandiseSubtotal.add(lineSubtotal);
            capturedBillable.add(new SalesQuoteCapturedLineDto(
                    product.getId(), variant.getId(), line.quantity(),
                    snappedUnit, lineSubtotal, lineDisc, line.batchId(), false, sell));
            promoLines.add(new CommercialPricingEngine.PromoPricingLine(product, lineSubtotal));
        }

        capturedRewards.addAll(buildPromotionRewardLines(promo, req.lines(), merchandiseSubtotal));

        BigDecimal manual = req.manualDiscount() != null ? req.manualDiscount() : BigDecimal.ZERO;
        BigDecimal shipFee;
        ShippingQuoteSnapshotDto shipSnap;
        if ("storefront".equals(src)) {
            ShippingAddressDto addr = req.shippingAddress();
            if (addr == null) {
                throw new IllegalArgumentException("Storefront quote requires shippingAddress to compute shipping");
            }
            ShippingQuoteResponse shipRes = shippingQuoteService.quote(new ShippingQuoteRequest(
                    addr, merchandiseSubtotal, null, null, null, null));
            if (!"quoted".equals(shipRes.status())) {
                String why = shipRes.reasonIfUnavailable() != null ? shipRes.reasonIfUnavailable() : shipRes.status();
                throw new IllegalArgumentException("Khong bao gia duoc van chuyen: " + why);
            }
            shipFee = shipRes.fee() != null ? shipRes.fee() : BigDecimal.ZERO;
            ShippingQuoteResponse.EtaDaysDto eta = shipRes.etaDays();
            shipSnap = new ShippingQuoteSnapshotDto(
                    shipRes.source(),
                    shipRes.zoneCode(),
                    shipFee,
                    eta == null ? null : new ShippingQuoteSnapshotDto.EtaDaysDto(eta.min(), eta.max()));
        } else {
            ShippingQuoteSnapshotDto shipSnapInput = req.shippingQuoteSnapshot();
            BigDecimal shipFeeRaw = shipSnapInput != null && shipSnapInput.fee() != null
                    ? shipSnapInput.fee()
                    : BigDecimal.ZERO;
            if (shipFeeRaw.compareTo(BigDecimal.ZERO) < 0) {
                throw new IllegalArgumentException("Phi van chuyen khong duoc am");
            }
            shipFee = shipFeeRaw;
            shipSnap = shipSnapInput != null
                    ? new ShippingQuoteSnapshotDto(
                    shipSnapInput.source() != null ? shipSnapInput.source() : "client_snapshot",
                    shipSnapInput.zoneCode(),
                    shipFee,
                    shipSnapInput.etaDays())
                    : new ShippingQuoteSnapshotDto("quote", null, shipFee, null);
        }

        Voucher voucherRow = null;
        BigDecimal rawVoucherDiscount = BigDecimal.ZERO;
        BigDecimal rawShippingDiscountFromVoucher = BigDecimal.ZERO;
        if (!voucherCode.isEmpty()) {
            voucherRow = voucherRepository.findByCodeIgnoreCase(voucherCode)
                    .orElseThrow(() -> new IllegalArgumentException("Khong tim thay voucher: " + voucherCode));
            VoucherQuoteEvaluator.assertEligibleOrThrow(voucherRow, voucherCode, clock);
            var rawDisc = VoucherQuoteEvaluator.computeRawDiscounts(
                    voucherRow, merchandiseSubtotal, shipFee, voucherCode);
            rawVoucherDiscount = rawDisc.voucherDiscount();
            rawShippingDiscountFromVoucher = rawDisc.shippingDiscount();
        }

        BigDecimal vatPct = req.vatPercent() != null ? req.vatPercent() : BigDecimal.ZERO;

        PricingBreakdownSnapshotDto breakdown = CommercialPricingEngine.computePricing(
                merchandiseSubtotal,
                manual,
                promo,
                promoLines,
                rawVoucherDiscount,
                shipFee,
                rawShippingDiscountFromVoucher,
                vatPct
        );

        if (!voucherCode.isEmpty()) {
            if (breakdown.voucherDiscount().compareTo(BigDecimal.ZERO) <= 0
                    && breakdown.shippingDiscount().compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException("Voucher khong ap dung duoc (giam gia bang 0 sau cac khoan khac)");
            }
        }

        List<GiftLineSnapshotDto> giftSnapshots = mapGiftSnapshots(capturedRewards, promo);
        PromotionSnapshotDto promotionSnapshot = promo == null ? null : new PromotionSnapshotDto(
                String.valueOf(promo.getId()),
                promo.getName(),
                promo.getType(),
                null,
                breakdown.promotionDiscount(),
                BigDecimal.ZERO,
                null,
                giftSnapshots
        );

        VoucherSnapshotDto voucherSnapshot = voucherRow == null ? null : new VoucherSnapshotDto(
                voucherRow.getCode(),
                voucherRow.getRuleSummary(),
                breakdown.voucherDiscount(),
                breakdown.shippingDiscount());

        SalesQuotePayloadDto payload = SalesQuotePayloadDto.from(
                req.source(),
                breakdown,
                promotionSnapshot,
                voucherSnapshot,
                shipSnap,
                capturedBillable,
                capturedRewards
        );

        String publicId = UUID.randomUUID().toString();
        LocalDateTime expiresAt = LocalDateTime.now(clock).plusMinutes(QUOTE_TTL_MINUTES);

        SalesQuote entity = new SalesQuote();
        entity.setPublicId(publicId);
        entity.setExpiresAt(expiresAt);
        try {
            entity.setPayloadJson(objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            throw new IllegalStateException("Cannot serialize quote payload", e);
        }
        salesQuoteRepository.save(entity);

        List<SalesQuoteLineResponse> lineResponses = new ArrayList<>();
        for (SalesQuoteCapturedLineDto c : capturedBillable) {
            lineResponses.add(toLineResponse(c));
        }
        List<SalesQuoteLineResponse> rewardResponses = new ArrayList<>();
        for (SalesQuoteCapturedLineDto c : capturedRewards) {
            rewardResponses.add(toLineResponse(c));
        }

        return new SalesQuoteResponse(
                publicId,
                expiresAt,
                lineResponses,
                rewardResponses,
                promotionSnapshot,
                voucherSnapshot,
                shipSnap,
                breakdown
        );
    }

    private void assertQuoteSupportedPromotionType(Promotion promo) {
        String t = promo.getType();
        if ("FREE_SHIPPING".equals(t)) {
            throw new IllegalArgumentException(
                    "Khuyen mai FREE_SHIPPING chua ho tro trong bao gia — dung voucher free_shipping");
        }
        if (!Set.of("PERCENT_DISCOUNT", "FIXED_DISCOUNT", "BUY_X_GET_Y", "QUANTITY_GIFT").contains(t)) {
            throw new IllegalArgumentException("Loai khuyen mai khong ho tro trong bao gia: " + t);
        }
    }

    private List<SalesQuoteCapturedLineDto> buildPromotionRewardLines(
            Promotion promo,
            List<SalesQuoteLineRequest> reqLines,
            BigDecimal merchandiseSubtotal
    ) {
        if (promo == null) {
            return List.of();
        }
        String type = promo.getType();
        if ("PERCENT_DISCOUNT".equals(type) || "FIXED_DISCOUNT".equals(type)) {
            return List.of();
        }
        BigDecimal minOrder = promo.getMinOrderValue() != null ? promo.getMinOrderValue() : BigDecimal.ZERO;
        if (merchandiseSubtotal.compareTo(minOrder) < 0) {
            return List.of();
        }
        if ("BUY_X_GET_Y".equals(type)) {
            return buildBuyXGetYRewards(promo, reqLines);
        }
        if ("QUANTITY_GIFT".equals(type)) {
            return buildQuantityGiftRewards(promo, reqLines);
        }
        return List.of();
    }

    private int eligiblePromoUnits(Promotion promo, List<SalesQuoteLineRequest> reqLines) {
        int sum = 0;
        for (SalesQuoteLineRequest line : reqLines) {
            if (line.rewardLine()) {
                continue;
            }
            Product p = productRepo.findById(line.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Khong tim thay san pham ID: " + line.productId()));
            if (productMatchesPromotion(promo, p)) {
                sum += line.quantity();
            }
        }
        return sum;
    }

    private boolean productMatchesPromotion(Promotion promo, Product p) {
        String appliesTo = promo.getAppliesTo();
        if (appliesTo == null || "ALL".equals(appliesTo)) {
            return true;
        }
        if ("PRODUCT".equals(appliesTo)) {
            return promo.getProducts().stream().anyMatch(x -> x.getId().equals(p.getId()));
        }
        if ("CATEGORY".equals(appliesTo)) {
            if (p.getCategory() == null) {
                return false;
            }
            Long catId = p.getCategory().getId();
            return promo.getCategories().stream().anyMatch(c -> c.getId().equals(catId));
        }
        return true;
    }

    private List<SalesQuoteCapturedLineDto> buildBuyXGetYRewards(Promotion promo, List<SalesQuoteLineRequest> reqLines) {
        Integer x = promo.getBuyQty();
        Integer yQty = promo.getGetQty();
        Long giftPid = promo.getGetProductId();
        if (x == null || x <= 0 || yQty == null || yQty <= 0 || giftPid == null) {
            throw new IllegalArgumentException("Khuyen mai BUY_X_GET_Y thieu buy_qty / get_qty / get_product_id hop le");
        }
        int eligible = eligiblePromoUnits(promo, reqLines);
        int times = eligible / x;
        if (times <= 0) {
            return List.of();
        }
        int rewardQty = times * yQty;
        return List.of(mkRewardCapturedLine(giftPid, rewardQty));
    }

    private List<SalesQuoteCapturedLineDto> buildQuantityGiftRewards(Promotion promo, List<SalesQuoteLineRequest> reqLines) {
        Integer minB = promo.getMinBuyQty();
        Integer maxB = promo.getMaxBuyQty();
        Integer yQty = promo.getGetQty();
        Long giftPid = promo.getGetProductId();
        if (minB == null || minB <= 0 || yQty == null || yQty <= 0 || giftPid == null) {
            throw new IllegalArgumentException(
                    "Khuyen mai QUANTITY_GIFT thieu min_buy_qty / get_qty / get_product_id hop le");
        }
        if (maxB != null && maxB < minB) {
            throw new IllegalArgumentException("Khuyen mai QUANTITY_GIFT: max_buy_qty < min_buy_qty");
        }
        int eligible = eligiblePromoUnits(promo, reqLines);
        if (eligible < minB) {
            return List.of();
        }
        if (maxB != null && eligible > maxB) {
            return List.of();
        }
        return List.of(mkRewardCapturedLine(giftPid, yQty));
    }

    private SalesQuoteCapturedLineDto mkRewardCapturedLine(Long giftProductId, int rewardQty) {
        Product giftProduct = productRepo.findById(giftProductId)
                .orElseThrow(() -> new IllegalArgumentException("Qua tang: khong tim thay san pham " + giftProductId));
        if (!giftProduct.getActive()) {
            throw new IllegalArgumentException("Qua tang: san pham " + giftProduct.getName() + " da ngung kinh doanh");
        }
        if (giftProduct.isCombo()) {
            throw new IllegalArgumentException("Qua tang: combo chua ho tro");
        }
        ProductVariant giftVariant = variantService.resolveVariant(null, giftProduct.getId(), true);
        giftVariant = variantRepo.findById(giftVariant.getId()).orElseThrow();
        if (!Boolean.TRUE.equals(giftVariant.getActive()) || !Boolean.TRUE.equals(giftVariant.getIsSellable())) {
            throw new IllegalArgumentException("Qua tang: variant khong ban duoc");
        }
        if (giftVariant.getStockQty() < rewardQty) {
            throw new IllegalArgumentException(
                    "Khong du ton qua tang '" + giftProduct.getName() + "' [" + giftVariant.getVariantCode()
                            + "] — can " + rewardQty + ", co " + giftVariant.getStockQty());
        }
        BigDecimal sell = giftVariant.getSellPrice();
        return new SalesQuoteCapturedLineDto(
                giftProduct.getId(),
                giftVariant.getId(),
                rewardQty,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null,
                true,
                sell
        );
    }

    private List<GiftLineSnapshotDto> mapGiftSnapshots(List<SalesQuoteCapturedLineDto> rewards, Promotion promo) {
        if (rewards.isEmpty()) {
            return List.of();
        }
        String promoId = promo == null ? null : String.valueOf(promo.getId());
        String promoName = promo == null ? null : promo.getName();
        List<GiftLineSnapshotDto> out = new ArrayList<>();
        for (SalesQuoteCapturedLineDto r : rewards) {
            Product p = productRepo.findById(r.productId()).orElseThrow();
            ProductVariant v = variantRepo.findById(r.variantId()).orElseThrow();
            out.add(new GiftLineSnapshotDto(
                    String.valueOf(r.productId()),
                    String.valueOf(r.variantId()),
                    p.getName(),
                    v.getVariantName(),
                    r.quantity(),
                    r.unitPrice(),
                    r.lineSubtotal(),
                    promoId,
                    promoName
            ));
        }
        return out;
    }

    private SalesQuoteLineResponse toLineResponse(SalesQuoteCapturedLineDto c) {
        Product p = productRepo.findById(c.productId()).orElseThrow();
        ProductVariant v = variantRepo.findById(c.variantId()).orElseThrow();
        return new SalesQuoteLineResponse(
                c.productId(),
                c.variantId(),
                p.getName(),
                v.getVariantName(),
                c.quantity(),
                c.unitPrice(),
                c.lineSubtotal(),
                c.discountPercent(),
                c.batchId(),
                c.rewardLine(),
                c.originalUnitPrice()
        );
    }
}
