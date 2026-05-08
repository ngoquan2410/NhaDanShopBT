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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
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
    private final PromotionEvaluationService promotionEvaluationService;
    private final ObjectMapper objectMapper;
    private final Clock businessClock;
    private final UserRepository userRepository;
    private final AccountService accountService;
    private final CustomerLoyaltyService loyaltyService;
    private final ProductComboRepository comboItemRepo;

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

        String selectedPromotionInvalidReason = null;
        Promotion selectedPromo = null;
        if (req.promotionId() != null) {
            Promotion loaded = promotionRepository.findByIdWithDetails(req.promotionId()).orElse(null);
            if (loaded == null) {
                selectedPromotionInvalidReason = "Chương trình khuyến mãi không tồn tại";
            } else if (!loaded.isCurrentlyActive()) {
                selectedPromotionInvalidReason = "Chương trình khuyến mãi không còn hiệu lực";
            } else {
                try {
                    assertQuoteSupportedPromotionType(loaded);
                    selectedPromo = loaded;
                } catch (IllegalArgumentException ex) {
                    selectedPromotionInvalidReason = ex.getMessage();
                }
            }
        }

        BigDecimal merchandiseSubtotal = BigDecimal.ZERO;
        List<SalesQuoteCapturedLineDto> capturedBillableBare = new ArrayList<>();
        List<CommercialPricingEngine.BillableAllocationRow> billableRows = new ArrayList<>();
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
                ProductVariant variant = variantService.resolveVariant(line.variantId(), product.getId(), true);
                variantRepo.findById(variant.getId()).orElseThrow();
                if (!Boolean.TRUE.equals(variant.getActive())) {
                    throw new IllegalArgumentException("Variant '" + variant.getVariantCode() + "' khong hoat dong");
                }
                if (!Boolean.TRUE.equals(variant.getIsSellable())) {
                    throw new IllegalArgumentException("Variant '" + variant.getVariantCode() + "' khong ban duoc");
                }
                if (line.batchId() != null) {
                    throw new IllegalArgumentException("Combo quote khong ho tro batchId");
                }
                List<ProductComboItem> comboItems = comboItemRepo.findByComboProduct(product);
                if (comboItems.isEmpty()) {
                    throw new IllegalStateException("Combo '" + product.getName() + "' chua co thanh phan");
                }
                int comboQty = line.quantity();
                for (ProductComboItem ci : comboItems) {
                    ProductVariant compVariant = variantService.resolveVariant(null, ci.getProduct().getId(), false);
                    int required = ci.getQuantity() * comboQty;
                    if (compVariant.getStockQty() < required) {
                        throw new IllegalArgumentException(
                                        "Combo '" + product.getName() + "': thanh phan '" + ci.getProduct().getName()
                                        + "' khong du hang. Can: " + required + ", ton: " + compVariant.getStockQty());
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
                Long categoryId = product.getCategory() != null ? product.getCategory().getId() : null;
                BigDecimal lineGrossCatalog =
                        sell.multiply(BigDecimal.valueOf(line.quantity())).setScale(0, RoundingMode.HALF_UP);

                merchandiseSubtotal = merchandiseSubtotal.add(lineSubtotal);
                capturedBillableBare.add(new SalesQuoteCapturedLineDto(
                        product.getId(), variant.getId(), line.quantity(),
                        snappedUnit, lineSubtotal, lineDisc, line.batchId(), false, sell, null));
                billableRows.add(new CommercialPricingEngine.BillableAllocationRow(
                        product.getId(), categoryId, lineGrossCatalog, lineSubtotal));
                promoLines.add(new CommercialPricingEngine.PromoPricingLine(product, lineSubtotal));
                continue;
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
                LocalDate today = LocalDate.now(businessClock);
                if (batch.getExpiryDate() != null && batch.getExpiryDate().isBefore(today)) {
                    throw new IllegalArgumentException("Lo hang da het han, khong the bao gia voi batchId chi dinh.");
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
            Long categoryId = product.getCategory() != null ? product.getCategory().getId() : null;
            BigDecimal lineGrossCatalog =
                    sell.multiply(BigDecimal.valueOf(line.quantity())).setScale(0, RoundingMode.HALF_UP);

            merchandiseSubtotal = merchandiseSubtotal.add(lineSubtotal);
            capturedBillableBare.add(new SalesQuoteCapturedLineDto(
                    product.getId(), variant.getId(), line.quantity(),
                    snappedUnit, lineSubtotal, lineDisc, line.batchId(), false, sell, null));
            billableRows.add(new CommercialPricingEngine.BillableAllocationRow(
                    product.getId(), categoryId, lineGrossCatalog, lineSubtotal));
            promoLines.add(new CommercialPricingEngine.PromoPricingLine(product, lineSubtotal));
        }

        Promotion appliedPromo = selectedPromo;
        try {
            capturedRewards.addAll(buildPromotionRewardLines(appliedPromo, req.lines(), merchandiseSubtotal));
        } catch (IllegalArgumentException ex) {
            if (req.promotionId() != null) {
                selectedPromotionInvalidReason = selectedPromotionInvalidReason != null
                        ? selectedPromotionInvalidReason
                        : ex.getMessage();
                appliedPromo = null;
                capturedRewards.clear();
            } else {
                throw ex;
            }
        }
        if (appliedPromo != null
                && ("BUY_X_GET_Y".equals(appliedPromo.getType()) || "QUANTITY_GIFT".equals(appliedPromo.getType()))
                && capturedRewards.isEmpty()
                && req.promotionId() != null) {
            if (selectedPromotionInvalidReason == null) {
                selectedPromotionInvalidReason = "Khuyến mãi đã chọn không đủ điều kiện";
            }
            appliedPromo = null;
        }
        assertVariantDemandAvailable(capturedBillableBare, capturedRewards);

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
            VoucherQuoteEvaluator.assertEligibleOrThrow(voucherRow, voucherCode, businessClock);
            var rawDisc = VoucherQuoteEvaluator.computeRawDiscounts(
                    voucherRow, merchandiseSubtotal, shipFee, voucherCode);
            rawVoucherDiscount = rawDisc.voucherDiscount();
            rawShippingDiscountFromVoucher = rawDisc.shippingDiscount();
        }

        BigDecimal rawShippingDiscountFromPromotion =
                computePromotionShippingDiscount(appliedPromo, req.lines(), merchandiseSubtotal, shipFee);
        BigDecimal actualPromoShippingDiscount = rawShippingDiscountFromPromotion.min(shipFee).max(BigDecimal.ZERO);
        BigDecimal remainingShippingForVoucher = shipFee.subtract(actualPromoShippingDiscount).max(BigDecimal.ZERO);
        BigDecimal actualVoucherShippingDiscount = rawShippingDiscountFromVoucher.min(remainingShippingForVoucher).max(BigDecimal.ZERO);

        BigDecimal vatPct = req.vatPercent() != null ? req.vatPercent() : BigDecimal.ZERO;

        CommercialPricingEngine.QuoteCommercialResult preLoyaltyCommercial =
                CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                        merchandiseSubtotal,
                        manual,
                        appliedPromo,
                        promoLines,
                        billableRows,
                        rawVoucherDiscount,
                        shipFee,
                        actualPromoShippingDiscount,
                        actualVoucherShippingDiscount,
                        vatPct
                );

        LoyaltyRedemptionSnapshotDto loyaltySnapshot = null;
        BigDecimal loyaltyDiscount = BigDecimal.ZERO;
        long loyaltyRedeemedPoints = 0L;
        Long requestedRedeemPoints = req.requestedRedeemPoints();
        if (requestedRedeemPoints != null && requestedRedeemPoints > 0) {
            if (anonymous) {
                throw new IllegalArgumentException("Khách vãng lai không thể đổi điểm");
            }
            User user = userRepository.findByUsername(auth.getName())
                    .orElseThrow(() -> new IllegalArgumentException("Không tìm thấy user đổi điểm"));
            Customer linkedCustomer = user.getCustomer() != null ? user.getCustomer() : accountService.ensureLinkedCustomer(user.getUsername());
            Long requestCustomerId = parseNullableLong(req.customerId());
            if (requestCustomerId != null && !requestCustomerId.equals(linkedCustomer.getId())) {
                throw new IllegalArgumentException("Không thể đổi điểm của khách hàng khác");
            }
            loyaltySnapshot = loyaltyService.capRedemption(linkedCustomer, requestedRedeemPoints,
                    preLoyaltyCommercial.breakdown().itemNetRevenue());
            loyaltyDiscount = loyaltySnapshot != null && loyaltySnapshot.discountAmount() != null
                    ? loyaltySnapshot.discountAmount()
                    : BigDecimal.ZERO;
            loyaltyRedeemedPoints = loyaltySnapshot != null && loyaltySnapshot.redeemedPoints() != null
                    ? loyaltySnapshot.redeemedPoints()
                    : 0L;
        }

        CommercialPricingEngine.QuoteCommercialResult quoteCommercial =
                CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                        merchandiseSubtotal,
                        manual,
                        appliedPromo,
                        promoLines,
                        billableRows,
                        rawVoucherDiscount,
                        loyaltyDiscount,
                        loyaltyRedeemedPoints,
                        shipFee,
                        actualPromoShippingDiscount,
                        actualVoucherShippingDiscount,
                        vatPct
                );
        PricingBreakdownSnapshotDto breakdown = quoteCommercial.breakdown();
        List<SalesQuoteCapturedLineDto> capturedBillable = new ArrayList<>(capturedBillableBare.size());
        for (int i = 0; i < capturedBillableBare.size(); i++) {
            SalesQuoteCapturedLineDto c = capturedBillableBare.get(i);
            capturedBillable.add(new SalesQuoteCapturedLineDto(
                    c.productId(),
                    c.variantId(),
                    c.quantity(),
                    c.unitPrice(),
                    c.lineSubtotal(),
                    c.discountPercent(),
                    c.batchId(),
                    c.rewardLine(),
                    c.originalUnitPrice(),
                    quoteCommercial.billableLineSnapshots().get(i)
            ));
        }

        if (!voucherCode.isEmpty()) {
            if (breakdown.voucherDiscount().compareTo(BigDecimal.ZERO) <= 0
                    && breakdown.shippingDiscount().compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException("Voucher khong ap dung duoc (giam gia bang 0 sau cac khoan khac)");
            }
        }

        List<PromotionAffectedLineDto> affectedSnapshots = mapAffectedLineSnapshots(capturedBillable);
        List<GiftLineSnapshotDto> giftSnapshots = mapGiftSnapshots(capturedRewards, appliedPromo);
        PromotionSnapshotDto promotionSnapshot = appliedPromo == null ? null : new PromotionSnapshotDto(
                String.valueOf(appliedPromo.getId()),
                appliedPromo.getName(),
                appliedPromo.getType(),
                null,
                breakdown.promotionDiscount(),
                actualPromoShippingDiscount,
                affectedSnapshots,
                giftSnapshots
        );

        VoucherSnapshotDto voucherSnapshot = voucherRow == null ? null : new VoucherSnapshotDto(
                voucherRow.getCode(),
                voucherRow.getRuleSummary(),
                breakdown.voucherDiscount(),
                actualVoucherShippingDiscount);

        SalesQuotePayloadDto payload = SalesQuotePayloadDto.from(
                req.source(),
                breakdown,
                promotionSnapshot,
                voucherSnapshot,
                shipSnap,
                loyaltySnapshot,
                capturedBillable,
                capturedRewards
        );

        String publicId = UUID.randomUUID().toString();
        LocalDateTime expiresAt = LocalDateTime.now(businessClock).plusMinutes(QUOTE_TTL_MINUTES);

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

        Long fallbackPromotionId = resolveFallbackPromotionId(
                req, selectedPromotionInvalidReason, capturedBillableBare, merchandiseSubtotal, shipFee);

        return new SalesQuoteResponse(
                publicId,
                expiresAt,
                lineResponses,
                rewardResponses,
                promotionSnapshot,
                voucherSnapshot,
                shipSnap,
                breakdown,
                loyaltySnapshot,
                appliedPromo != null ? appliedPromo.getId() : null,
                appliedPromo != null ? appliedPromo.getName() : null,
                appliedPromo != null ? appliedPromo.getType() : null,
                selectedPromotionInvalidReason,
                fallbackPromotionId
        );
    }

    /**
     * When the shopper's chosen promotion cannot be applied, suggest another eligible program (if any),
     * using the same preview rules as POST /api/promotions/pick-best.
     */
    private Long resolveFallbackPromotionId(
            SalesQuoteRequest req,
            String selectedPromotionInvalidReason,
            List<SalesQuoteCapturedLineDto> billableBare,
            BigDecimal merchandiseSubtotal,
            BigDecimal shipFee
    ) {
        if (req.promotionId() == null || selectedPromotionInvalidReason == null || billableBare.isEmpty()) {
            return null;
        }
        List<PromotionEvaluationLineRequest> evalLines = new ArrayList<>();
        for (SalesQuoteCapturedLineDto c : billableBare) {
            if (c.rewardLine()) {
                continue;
            }
            evalLines.add(new PromotionEvaluationLineRequest(
                    null,
                    c.productId(),
                    c.variantId(),
                    c.quantity(),
                    c.unitPrice(),
                    c.lineSubtotal()));
        }
        if (evalLines.isEmpty()) {
            return null;
        }
        BigDecimal fee = shipFee != null ? shipFee : BigDecimal.ZERO;
        boolean pendingShip = fee.compareTo(BigDecimal.ZERO) <= 0;
        PromotionEvaluationResponse best = promotionEvaluationService.pickBest(
                new PromotionEvaluationRequest(null, evalLines, merchandiseSubtotal, fee, pendingShip));
        if (best == null || best.promotionId() == null) {
            return null;
        }
        try {
            long picked = Long.parseLong(best.promotionId());
            return picked != req.promotionId() ? picked : null;
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Long parseNullableLong(String value) {
        if (value == null || value.isBlank()) return null;
        try { return Long.parseLong(value); } catch (NumberFormatException ex) { return null; }
    }

    private void assertQuoteSupportedPromotionType(Promotion promo) {
        String t = promo.getType();
        if (!Set.of("PERCENT_DISCOUNT", "FIXED_DISCOUNT", "BUY_X_GET_Y", "QUANTITY_GIFT", "FREE_SHIPPING").contains(t)) {
            throw new IllegalArgumentException("Loai khuyen mai khong ho tro trong bao gia: " + t);
        }
    }

    private BigDecimal computePromotionShippingDiscount(
            Promotion promo,
            List<SalesQuoteLineRequest> reqLines,
            BigDecimal merchandiseSubtotal,
            BigDecimal shippingFee
    ) {
        if (promo == null || !"FREE_SHIPPING".equals(promo.getType())) {
            return BigDecimal.ZERO;
        }
        if (shippingFee == null || shippingFee.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal minOrder = promo.getMinOrderValue() != null ? promo.getMinOrderValue() : BigDecimal.ZERO;
        BigDecimal minOrderBasis = minOrderBasisForQuote(promo, reqLines, merchandiseSubtotal);
        if (minOrderBasis.compareTo(minOrder) < 0) {
            return BigDecimal.ZERO;
        }
        if (eligiblePromoUnits(promo, reqLines) <= 0) {
            return BigDecimal.ZERO;
        }
        BigDecimal cap = promo.getMaxDiscount() != null && promo.getMaxDiscount().compareTo(BigDecimal.ZERO) > 0
                ? promo.getMaxDiscount()
                : shippingFee;
        return shippingFee.min(cap).max(BigDecimal.ZERO);
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
        BigDecimal minOrderBasis = minOrderBasisForQuote(promo, reqLines, merchandiseSubtotal);
        if (minOrderBasis.compareTo(minOrder) < 0) {
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

    private boolean minOrderWholeOrder(Promotion promo) {
        if (promo.getAppliesTo() == null || "ALL".equals(promo.getAppliesTo())) {
            return true;
        }
        return "WHOLE_ORDER".equalsIgnoreCase(promo.getMinOrderScope());
    }

    private BigDecimal eligibleSubtotalForQuote(Promotion promo, List<SalesQuoteLineRequest> reqLines) {
        BigDecimal subtotal = BigDecimal.ZERO;
        for (SalesQuoteLineRequest line : reqLines) {
            if (line.rewardLine()) continue;
            Product p = productRepo.findById(line.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Khong tim thay san pham ID: " + line.productId()));
            if (!productMatchesPromotion(promo, p)) continue;
            ProductVariant variant = variantService.resolveVariant(line.variantId(), p.getId(), true);
            BigDecimal lineDisc = line.discountPercent() != null ? line.discountPercent() : BigDecimal.ZERO;
            BigDecimal factor = BigDecimal.ONE.subtract(
                    lineDisc.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal snappedUnit = variant.getSellPrice().multiply(factor).setScale(0, RoundingMode.HALF_UP);
            subtotal = subtotal.add(snappedUnit.multiply(BigDecimal.valueOf(line.quantity())));
        }
        return subtotal;
    }

    private BigDecimal minOrderBasisForQuote(Promotion promo, List<SalesQuoteLineRequest> reqLines, BigDecimal merchandiseSubtotal) {
        if (minOrderWholeOrder(promo)) {
            return merchandiseSubtotal != null ? merchandiseSubtotal : BigDecimal.ZERO;
        }
        return eligibleSubtotalForQuote(promo, reqLines);
    }

    private List<SalesQuoteCapturedLineDto> buildBuyXGetYRewards(Promotion promo, List<SalesQuoteLineRequest> reqLines) {
        Integer buyQty = promo.getBuyQty();
        Integer yQty = promo.getGetQty();
        Long giftPid = promo.getGetProductId();
        if (buyQty == null || buyQty <= 0 || yQty == null || yQty <= 0 || giftPid == null) {
            throw new IllegalArgumentException("Khuyen mai BUY_X_GET_Y thieu buy_qty / get_qty / get_product_id hop le");
        }
        List<PromotionRewardCalculator.BuyRequirement> requirements = PromotionRewardCalculator.buyRequirements(promo);
        if (requirements.isEmpty()) {
            if (!isLegacyAllScopeBuyXGetY(promo)) {
                return List.of();
            }
            int eligibleQty = 0;
            for (SalesQuoteLineRequest line : reqLines) {
                if (!line.rewardLine()) {
                    eligibleQty += line.quantity();
                }
            }
            boolean repeatable = Boolean.TRUE.equals(promo.getRepeatable());
            int times = repeatable ? (eligibleQty / buyQty) : (eligibleQty >= buyQty ? 1 : 0);
            if (times <= 0) {
                return List.of();
            }
            return List.of(mkRewardCapturedLine(giftPid, times * yQty));
        }
        Map<Long, Integer> qtyByProduct = qtyByProductMatchingPromotion(promo, reqLines);
        int times = PromotionRewardCalculator.buyXGetYTimes(promo, qtyByProduct);
        if (times <= 0) {
            return List.of();
        }
        return List.of(mkRewardCapturedLine(giftPid, times * yQty));
    }

    private static boolean isLegacyAllScopeBuyXGetY(Promotion promo) {
        if (promo == null) {
            return false;
        }
        boolean allScope = promo.getAppliesTo() == null || "ALL".equals(promo.getAppliesTo());
        boolean noBuyItems = promo.getBuyItems() == null || promo.getBuyItems().isEmpty();
        boolean noProductScope = promo.getProducts() == null || promo.getProducts().isEmpty();
        return allScope && noBuyItems && noProductScope;
    }

    private static boolean isOrderOnlyQuantityGift(Promotion p) {
        return p.getProducts() == null || p.getProducts().isEmpty();
    }

    private List<SalesQuoteCapturedLineDto> buildQuantityGiftRewards(Promotion promo, List<SalesQuoteLineRequest> reqLines) {
        Integer yQty = promo.getGetQty();
        Long giftPid = promo.getGetProductId();
        if (yQty == null || yQty <= 0 || giftPid == null) {
            throw new IllegalArgumentException(
                    "Khuyen mai QUANTITY_GIFT thieu get_qty / get_product_id hop le");
        }
        Map<Long, Integer> qtyByProduct;
        if (isOrderOnlyQuantityGift(promo)) {
            qtyByProduct = new HashMap<>();
            for (SalesQuoteLineRequest line : reqLines) {
                if (line.rewardLine()) {
                    continue;
                }
                qtyByProduct.merge(line.productId(), line.quantity(), Integer::sum);
            }
        } else {
            qtyByProduct = qtyByProductMatchingPromotion(promo, reqLines);
        }
        int times = PromotionRewardCalculator.quantityGiftTimes(promo, qtyByProduct);
        if (times <= 0) {
            return List.of();
        }
        return List.of(mkRewardCapturedLine(giftPid, times * yQty));
    }

    private Map<Long, Integer> qtyByProductMatchingPromotion(Promotion promo, List<SalesQuoteLineRequest> reqLines) {
        Map<Long, Integer> m = new HashMap<>();
        for (SalesQuoteLineRequest line : reqLines) {
            if (line.rewardLine()) {
                continue;
            }
            Product p = productRepo.findById(line.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Khong tim thay san pham ID: " + line.productId()));
            if (productMatchesPromotion(promo, p)) {
                m.merge(line.productId(), line.quantity(), Integer::sum);
            }
        }
        return m;
    }

    private void assertVariantDemandAvailable(
            List<SalesQuoteCapturedLineDto> billableLines,
            List<SalesQuoteCapturedLineDto> rewardLines) {
        Map<Long, Integer> demandByVariant = new HashMap<>();
        for (SalesQuoteCapturedLineDto line : billableLines) {
            demandByVariant.merge(line.variantId(), line.quantity(), Integer::sum);
        }
        for (SalesQuoteCapturedLineDto line : rewardLines) {
            demandByVariant.merge(line.variantId(), line.quantity(), Integer::sum);
        }
        for (Map.Entry<Long, Integer> entry : demandByVariant.entrySet()) {
            ProductVariant variant = variantRepo.findById(entry.getKey()).orElseThrow();
            int sellableQty = batchRepo.sumSellableRemainingQtyByVariantId(
                    entry.getKey(),
                    LocalDate.now(businessClock));
            if (sellableQty < entry.getValue()) {
                throw new IllegalArgumentException(
                        "Không đủ tồn bán được cho đơn hàng và quà tặng [" + variant.getVariantCode()
                                + "]. Cần " + entry.getValue() + ", còn " + sellableQty + ".");
            }
        }
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
        BigDecimal sell = giftVariant.getSellPrice();
        BigDecimal lineGross = sell.multiply(BigDecimal.valueOf(rewardQty)).setScale(0, RoundingMode.HALF_UP);
        CommercialLineSnapshotDto rewardCommercialSnapshot = new CommercialLineSnapshotDto(
                lineGross,
                lineGross,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                CommercialPricingEngine.COMMERCIAL_SNAPSHOT_VERSION
        );
        return new SalesQuoteCapturedLineDto(
                giftProduct.getId(),
                giftVariant.getId(),
                rewardQty,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                null,
                true,
                sell,
                rewardCommercialSnapshot
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

    private List<PromotionAffectedLineDto> mapAffectedLineSnapshots(List<SalesQuoteCapturedLineDto> billableLines) {
        List<PromotionAffectedLineDto> out = new ArrayList<>();
        for (SalesQuoteCapturedLineDto line : billableLines) {
            if (line.rewardLine() || line.commercialSnapshot() == null) {
                continue;
            }
            BigDecimal allocatedPromotionDiscount = line.commercialSnapshot().allocatedPromotionDiscount();
            if (allocatedPromotionDiscount == null || allocatedPromotionDiscount.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            Product product = productRepo.findById(line.productId()).orElseThrow();
            ProductVariant variant = variantRepo.findById(line.variantId()).orElseThrow();
            out.add(new PromotionAffectedLineDto(
                    null,
                    String.valueOf(line.productId()),
                    String.valueOf(line.variantId()),
                    product.getName(),
                    variant.getVariantName(),
                    line.quantity(),
                    allocatedPromotionDiscount,
                    null,
                    null
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
                c.originalUnitPrice(),
                c.commercialSnapshot()
        );
    }
}
