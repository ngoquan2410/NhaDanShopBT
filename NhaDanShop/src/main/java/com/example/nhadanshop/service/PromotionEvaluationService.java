package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.GiftLineSnapshotDto;
import com.example.nhadanshop.dto.PromotionAffectedLineDto;
import com.example.nhadanshop.dto.PromotionEvaluationLineRequest;
import com.example.nhadanshop.dto.PromotionEvaluationRequest;
import com.example.nhadanshop.dto.PromotionEvaluationResponse;
import com.example.nhadanshop.dto.PromotionProgressItemDto;
import com.example.nhadanshop.dto.PromotionProgressSnapshotDto;
import com.example.nhadanshop.dto.ShippingDiscountPreviewDto;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.entity.ProductVariant;
import com.example.nhadanshop.entity.Promotion;
import com.example.nhadanshop.repository.ProductRepository;
import com.example.nhadanshop.repository.ProductVariantRepository;
import com.example.nhadanshop.repository.PromotionRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PromotionEvaluationService {

    private final PromotionRepository promotionRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final Clock clock;
    private final SellableStockService sellableStockService;

    public List<PromotionEvaluationResponse> evaluate(PromotionEvaluationRequest request) {
        LocalDateTime now = LocalDateTime.now(clock);
        List<Promotion> candidates;
        if (request.promotionId() != null) {
            Promotion one = promotionRepository.findByIdWithDetails(request.promotionId())
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + request.promotionId()));
            candidates = List.of(one);
        } else {
            candidates = promotionRepository.findCurrentlyActiveWithDetails(now);
        }
        List<CartLine> lines = hydrateLines(request.lines());
        BigDecimal subtotal = request.subtotal() != null ? request.subtotal() : sumSubtotal(lines);
        BigDecimal shippingFee = request.shippingFee() != null ? request.shippingFee().max(BigDecimal.ZERO) : BigDecimal.ZERO;
        boolean pendingAddress = Boolean.TRUE.equals(request.pendingShippingAddress());
        return candidates.stream()
                .map(p -> evaluateOne(p, lines, subtotal, shippingFee, now, pendingAddress))
                .toList();
    }

    public PromotionEvaluationResponse pickBest(PromotionEvaluationRequest request) {
        return evaluate(request).stream()
                .filter(PromotionEvaluationResponse::eligible)
                .min(bestComparator())
                .orElse(null);
    }

    private Comparator<PromotionEvaluationResponse> bestComparator() {
        return Comparator
                .comparing((PromotionEvaluationResponse r) -> nvl(r.discountAmount()).add(nvl(r.shippingDiscountAmount())),
                        Comparator.reverseOrder())
                .thenComparing(r -> nvl(r.discountAmount()).compareTo(BigDecimal.ZERO) > 0 ? 0 : 1)
                .thenComparing(r -> promotionEndDate(r.promotionId()))
                .thenComparing(r -> parseId(r.promotionId()), Comparator.nullsLast(Comparator.naturalOrder()));
    }

    private LocalDateTime promotionEndDate(String promotionId) {
        Long id = parseId(promotionId);
        if (id == null) {
            return LocalDateTime.MAX;
        }
        return promotionRepository.findById(id).map(Promotion::getEndDate).orElse(LocalDateTime.MAX);
    }

    private PromotionEvaluationResponse evaluateOne(
            Promotion p,
            List<CartLine> lines,
            BigDecimal subtotal,
            BigDecimal shippingFee,
            LocalDateTime now,
            boolean pendingShippingAddress
    ) {
        if (!Boolean.TRUE.equals(p.getActive()) || now.isBefore(p.getStartDate()) || now.isAfter(p.getEndDate())) {
            return ineligible(p, "Ngoài thời gian áp dụng", null, null);
        }
        List<CartLine> scoped = scopedLines(p, lines);
        if (scoped.isEmpty() && !("QUANTITY_GIFT".equals(p.getType()) && isOrderOnlyQuantityGift(p))) {
            return ineligible(p, "Không đúng phạm vi áp dụng", null, null);
        }
        BigDecimal minOrderBasis = minOrderBasis(p, subtotal, scoped);
        if (minOrderBasis.compareTo(nvl(p.getMinOrderValue())) < 0) {
            PromotionProgressSnapshotDto prog = new PromotionProgressSnapshotDto(
                    "amount",
                    minOrderScope(p),
                    minOrderBasis,
                    nvl(p.getMinOrderValue()).subtract(minOrderBasis).max(BigDecimal.ZERO),
                    nvl(p.getMinOrderValue()),
                    null);
            return ineligible(p, "Chưa đạt đơn tối thiểu", prog, null);
        }
        BigDecimal scopedSubtotal = sumSubtotal(scoped.isEmpty() ? lines : scoped);
        return switch (p.getType()) {
            case "PERCENT_DISCOUNT" -> evalPercent(p, scoped, scopedSubtotal);
            case "FIXED_DISCOUNT" -> evalFixed(p, scoped, scopedSubtotal);
            case "FREE_SHIPPING" -> evalFreeShipping(p, scoped, shippingFee, pendingShippingAddress, subtotal);
            case "BUY_X_GET_Y" -> evalBuyXGetY(p, scoped);
            case "QUANTITY_GIFT" -> evalQuantityGift(p, scoped, lines);
            default -> ineligible(p, "Loại khuyến mãi không hỗ trợ", null, null);
        };
    }

    private static boolean isOrderOnlyQuantityGift(Promotion p) {
        return "QUANTITY_GIFT".equals(p.getType())
                && (p.getProducts() == null || p.getProducts().isEmpty());
    }

    private PromotionEvaluationResponse evalPercent(Promotion p, List<CartLine> scoped, BigDecimal scopedSubtotal) {
        BigDecimal amount = scopedSubtotal.multiply(nvl(p.getDiscountValue()))
                .divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
        if (p.getMaxDiscount() != null && p.getMaxDiscount().compareTo(BigDecimal.ZERO) > 0) {
            amount = amount.min(p.getMaxDiscount());
        }
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return ineligible(p, "Chưa có giá trị giảm hợp lệ", null, null);
        }
        return eligible(p, amount, BigDecimal.ZERO, affectedDiscounted(scoped, amount), List.of(), null, null);
    }

    private PromotionEvaluationResponse evalFixed(Promotion p, List<CartLine> scoped, BigDecimal scopedSubtotal) {
        BigDecimal amount = nvl(p.getDiscountValue()).min(scopedSubtotal).max(BigDecimal.ZERO);
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            return ineligible(p, "Chưa có giá trị giảm hợp lệ", null, null);
        }
        return eligible(p, amount, BigDecimal.ZERO, affectedDiscounted(scoped, amount), List.of(), null, null);
    }

    private PromotionEvaluationResponse evalFreeShipping(
            Promotion p,
            List<CartLine> scoped,
            BigDecimal shippingFee,
            boolean pendingShippingAddress,
            BigDecimal subtotal
    ) {
        BigDecimal cap = p.getMaxDiscount() != null && p.getMaxDiscount().compareTo(BigDecimal.ZERO) > 0
                ? p.getMaxDiscount()
                : null;
        if (pendingShippingAddress || shippingFee.compareTo(BigDecimal.ZERO) <= 0) {
            return new PromotionEvaluationResponse(
                    String.valueOf(p.getId()),
                    p.getName(),
                    p.getType(),
                    p.getDescription(),
                    false,
                    "Cần đủ địa chỉ và phí vận chuyển để áp dụng miễn phí ship",
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    List.of(),
                    List.of(),
                    null,
                    new ShippingDiscountPreviewDto(cap, true));
        }
        int units = eligiblePromoUnitsFromScoped(p, scoped);
        if (units <= 0) {
            return ineligible(p, "Không đúng phạm vi áp dụng", null, null);
        }
        BigDecimal effCap = cap != null ? cap : shippingFee;
        BigDecimal shippingDiscount = shippingFee.min(effCap).max(BigDecimal.ZERO);
        return eligible(
                p,
                BigDecimal.ZERO,
                shippingDiscount,
                List.of(),
                List.of(),
                null,
                new ShippingDiscountPreviewDto(cap, false));
    }

    private PromotionEvaluationResponse evalBuyXGetY(Promotion p, List<CartLine> scoped) {
        if (p.getGetQty() == null || p.getGetQty() <= 0 || p.getGetProductId() == null) {
            return ineligible(p, "Khuyến mãi cấu hình chưa đầy đủ", null, null);
        }
        var reqs = PromotionRewardCalculator.buyRequirements(p);
        if (reqs.isEmpty()) {
            if (!isLegacyAllScopeBuyXGetY(p)) {
                return ineligible(p, "Khuyến mãi BUY_X_GET_Y chưa cấu hình sản phẩm mua", null, null);
            }
            int buyQty = p.getBuyQty() != null && p.getBuyQty() > 0 ? p.getBuyQty() : 1;
            int eligibleQty = scoped.stream().mapToInt(CartLine::qty).sum();
            boolean repeatable = Boolean.TRUE.equals(p.getRepeatable());
            int times = repeatable ? (eligibleQty / buyQty) : (eligibleQty >= buyQty ? 1 : 0);
            if (times <= 0) {
                return ineligible(p, "Chưa đủ số lượng theo từng sản phẩm điều kiện", null, null);
            }
            int giftQty = times * p.getGetQty();
            GiftValidation gift = validateGift(p, giftQty, scoped);
            if (!gift.valid()) {
                return ineligible(p, gift.reason(), null, null);
            }
            return eligible(p, BigDecimal.ZERO, BigDecimal.ZERO, List.of(),
                    giftLines(p, giftQty, gift.product(), gift.variant()), null, null);
        }
        Map<Long, Integer> qtyByProduct = qtyByProduct(scoped);
        int times = PromotionRewardCalculator.buyXGetYTimes(p, qtyByProduct);
        if (times <= 0) {
            List<PromotionProgressItemDto> items = new ArrayList<>();
            for (var br : reqs) {
                int cur = qtyByProduct.getOrDefault(br.productId(), 0);
                int need = br.buyQty();
                int miss = Math.max(0, need - cur);
                String name = productRepository.findById(br.productId()).map(Product::getName).orElse("");
                items.add(new PromotionProgressItemDto(br.productId(), name, need, cur, miss));
            }
            PromotionProgressSnapshotDto prog = new PromotionProgressSnapshotDto("multi_quantity", "ITEM_QUANTITY", null, null, null, items);
            return ineligible(p, "Chưa đủ số lượng theo từng sản phẩm điều kiện", prog, null);
        }
        int giftQty = times * p.getGetQty();
        GiftValidation gift = validateGift(p, giftQty, scoped);
        if (!gift.valid()) {
            return ineligible(p, gift.reason(), null, null);
        }
        return eligible(p, BigDecimal.ZERO, BigDecimal.ZERO, List.of(),
                giftLines(p, giftQty, gift.product(), gift.variant()), null, null);
    }

    private PromotionEvaluationResponse evalQuantityGift(Promotion p, List<CartLine> scoped, List<CartLine> allPaid) {
        if (p.getGetQty() == null || p.getGetQty() <= 0 || p.getGetProductId() == null) {
            return ineligible(p, "Khuyến mãi cấu hình chưa đầy đủ", null, null);
        }
        List<CartLine> qtyScope = isOrderOnlyQuantityGift(p) ? allPaid : scoped;
        Map<Long, Integer> qtyByProduct = qtyByProduct(qtyScope);
        int times = PromotionRewardCalculator.quantityGiftTimes(p, qtyByProduct);
        if (times <= 0) {
            return ineligible(p, "Chưa đủ điều kiện quà tặng theo số lượng", buildQuantityGiftProgress(p, qtyByProduct), null);
        }
        int giftQty = times * p.getGetQty();
        GiftValidation gift = validateGift(p, giftQty, allPaid);
        if (!gift.valid()) {
            return ineligible(p, gift.reason(), null, null);
        }
        return eligible(p, BigDecimal.ZERO, BigDecimal.ZERO, List.of(),
                giftLines(p, giftQty, gift.product(), gift.variant()), null, null);
    }

    private PromotionProgressSnapshotDto buildQuantityGiftProgress(Promotion p, Map<Long, Integer> qtyByProduct) {
        if (p.getProducts() == null || p.getProducts().isEmpty()) {
            return null;
        }
        List<PromotionProgressItemDto> items = new ArrayList<>();
        int minB = p.getMinBuyQty() != null && p.getMinBuyQty() > 0 ? p.getMinBuyQty() : 1;
        for (Product pr : p.getProducts()) {
            int cur = qtyByProduct.getOrDefault(pr.getId(), 0);
            int miss = Math.max(0, minB - cur);
            items.add(new PromotionProgressItemDto(pr.getId(), pr.getName(), minB, cur, miss));
        }
        return new PromotionProgressSnapshotDto("multi_quantity", "ITEM_QUANTITY", null, null, null, items);
    }

    private GiftValidation validateGift(Promotion p, int qty, List<CartLine> paidLines) {
        Product product = productRepository.findById(p.getGetProductId()).orElse(null);
        if (product == null) {
            return GiftValidation.invalid("Không tìm thấy sản phẩm quà tặng");
        }
        if (!Boolean.TRUE.equals(product.getActive())) {
            return GiftValidation.invalid("Sản phẩm quà tặng đã ngừng kinh doanh");
        }
        if (product.isCombo()) {
            return GiftValidation.invalid("Quà tặng combo chưa hỗ trợ");
        }
        ProductVariant variant = variantRepository.findByProductIdAndIsDefaultTrue(product.getId()).orElse(null);
        if (variant == null) {
            return GiftValidation.invalid("Sản phẩm quà tặng chưa có variant mặc định");
        }
        if (!Boolean.TRUE.equals(variant.getActive()) || !Boolean.TRUE.equals(variant.getIsSellable())) {
            return GiftValidation.invalid("Variant quà tặng không bán được");
        }
        int stockQty = sellableStockService.salesSellableQtyByVariantId(variant.getId(), LocalDate.now(clock));
        int paidSameVariant = paidLines.stream()
                .filter(l -> l.variant() != null && variant.getId().equals(l.variant().getId()))
                .mapToInt(CartLine::qty)
                .sum();
        if (paidSameVariant + qty > stockQty) {
            return GiftValidation.invalid(
                    "Không đủ tồn quà tặng — cần " + (paidSameVariant + qty) + ", còn " + stockQty);
        }
        return new GiftValidation(true, null, product, variant);
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

    private List<GiftLineSnapshotDto> giftLines(Promotion p, int qty, Product product, ProductVariant variant) {
        return List.of(new GiftLineSnapshotDto(
                String.valueOf(p.getGetProductId()),
                variant.getId() != null ? String.valueOf(variant.getId()) : null,
                product.getName(),
                variant.getVariantName(),
                qty,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                String.valueOf(p.getId()),
                p.getName()
        ));
    }

    private PromotionEvaluationResponse eligible(
            Promotion p,
            BigDecimal discount,
            BigDecimal shippingDiscount,
            List<PromotionAffectedLineDto> affectedLines,
            List<GiftLineSnapshotDto> giftLines,
            PromotionProgressSnapshotDto progress,
            ShippingDiscountPreviewDto preview
    ) {
        return new PromotionEvaluationResponse(String.valueOf(p.getId()), p.getName(), p.getType(), p.getDescription(),
                true, null, discount, shippingDiscount, BigDecimal.ZERO, affectedLines, giftLines, progress, preview);
    }

    private PromotionEvaluationResponse ineligible(
            Promotion p,
            String reason,
            PromotionProgressSnapshotDto progress,
            ShippingDiscountPreviewDto preview
    ) {
        return new PromotionEvaluationResponse(String.valueOf(p.getId()), p.getName(), p.getType(), p.getDescription(),
                false, reason, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, List.of(), List.of(), progress, preview);
    }

    private List<PromotionAffectedLineDto> affectedDiscounted(List<CartLine> lines, BigDecimal totalDiscount) {
        if (lines.isEmpty() || totalDiscount.compareTo(BigDecimal.ZERO) <= 0) {
            return List.of();
        }
        BigDecimal perLine = totalDiscount.divide(BigDecimal.valueOf(lines.size()), 0, RoundingMode.DOWN);
        BigDecimal remainder = totalDiscount.subtract(perLine.multiply(BigDecimal.valueOf(lines.size())));
        List<PromotionAffectedLineDto> out = new ArrayList<>();
        for (int idx = 0; idx < lines.size(); idx++) {
            CartLine line = lines.get(idx);
            BigDecimal discountedAmount = perLine;
            if (idx == 0) {
                discountedAmount = discountedAmount.add(remainder);
            }
            if (discountedAmount.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }
            out.add(new PromotionAffectedLineDto(
                    line.id(),
                    String.valueOf(line.product().getId()),
                    line.variant() != null ? String.valueOf(line.variant().getId()) : null,
                    line.product().getName(),
                    line.variant() != null ? line.variant().getVariantName() : null,
                    line.qty(),
                    discountedAmount,
                    null,
                    null));
        }
        return out;
    }

    private List<CartLine> hydrateLines(List<PromotionEvaluationLineRequest> requestLines) {
        Map<Long, Product> products = productRepository.findAllById(requestLines.stream()
                        .map(PromotionEvaluationLineRequest::productId)
                        .filter(Objects::nonNull)
                        .collect(Collectors.toSet()))
                .stream().collect(Collectors.toMap(Product::getId, Function.identity()));
        return requestLines.stream().map(line -> {
            Product product = products.get(line.productId());
            if (product == null) {
                throw new EntityNotFoundException("Không tìm thấy sản phẩm ID: " + line.productId());
            }
            ProductVariant variant = line.variantId() == null
                    ? variantRepository.findByProductIdAndIsDefaultTrue(product.getId()).orElse(null)
                    : variantRepository.findById(line.variantId()).orElse(null);
            BigDecimal unitPrice = line.unitPrice() != null
                    ? line.unitPrice()
                    : (variant != null && variant.getSellPrice() != null ? variant.getSellPrice() : BigDecimal.ZERO);
            BigDecimal subtotal = line.lineSubtotal() != null
                    ? line.lineSubtotal()
                    : unitPrice.multiply(BigDecimal.valueOf(line.qty()));
            return new CartLine(
                    line.id() != null && !line.id().isBlank() ? line.id() : String.valueOf(product.getId()),
                    product,
                    variant,
                    line.qty(),
                    subtotal);
        }).toList();
    }

    private List<CartLine> scopedLines(Promotion p, List<CartLine> lines) {
        String scope = p.getAppliesTo();
        if (scope == null || "ALL".equals(scope)) {
            return lines;
        }
        if ("PRODUCT".equals(scope)) {
            var ids = p.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
            return lines.stream().filter(l -> ids.contains(l.product().getId())).toList();
        }
        if ("CATEGORY".equals(scope)) {
            var ids = p.getCategories().stream()
                    .map(com.example.nhadanshop.entity.Category::getId)
                    .collect(Collectors.toSet());
            return lines.stream()
                    .filter(l -> l.product().getCategory() != null && ids.contains(l.product().getCategory().getId()))
                    .toList();
        }
        return lines;
    }

    private BigDecimal sumSubtotal(List<CartLine> lines) {
        return lines.stream().map(CartLine::lineSubtotal).reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal nvl(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private String minOrderScope(Promotion p) {
        if (p.getAppliesTo() == null || "ALL".equals(p.getAppliesTo())) {
            return "WHOLE_ORDER";
        }
        return "WHOLE_ORDER".equalsIgnoreCase(p.getMinOrderScope()) ? "WHOLE_ORDER" : "ELIGIBLE_ITEMS";
    }

    private BigDecimal minOrderBasis(Promotion p, BigDecimal orderSubtotal, List<CartLine> scoped) {
        return "WHOLE_ORDER".equals(minOrderScope(p)) ? nvl(orderSubtotal) : sumSubtotal(scoped);
    }

    private Long parseId(String id) {
        try {
            return id == null ? null : Long.parseLong(id);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private int eligiblePromoUnits(Promotion promo, List<CartLine> reqLines) {
        int sum = 0;
        for (CartLine line : reqLines) {
            if (productMatchesPromotion(promo, line.product())) {
                sum += line.qty();
            }
        }
        return sum;
    }

    private int eligiblePromoUnitsFromScoped(Promotion promo, List<CartLine> scoped) {
        return eligiblePromoUnits(promo, scoped);
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

    private static Map<Long, Integer> qtyByProduct(List<CartLine> scoped) {
        Map<Long, Integer> m = new HashMap<>();
        for (CartLine line : scoped) {
            m.merge(line.product().getId(), line.qty(), Integer::sum);
        }
        return m;
    }

    private record CartLine(String id, Product product, ProductVariant variant, int qty, BigDecimal lineSubtotal) {}

    private record GiftValidation(boolean valid, String reason, Product product, ProductVariant variant) {
        private static GiftValidation invalid(String reason) {
            return new GiftValidation(false, reason, null, null);
        }
    }
}
