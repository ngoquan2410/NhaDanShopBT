package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.GiftLineSnapshotDto;
import com.example.nhadanshop.dto.PromotionAffectedLineDto;
import com.example.nhadanshop.dto.PromotionEvaluationLineRequest;
import com.example.nhadanshop.dto.PromotionEvaluationRequest;
import com.example.nhadanshop.dto.PromotionEvaluationResponse;
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
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
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

	public List<PromotionEvaluationResponse> evaluate(PromotionEvaluationRequest request) {
		LocalDateTime now = LocalDateTime.now(clock);
		List<Promotion> candidates = request.promotionId() != null
				? List.of(promotionRepository.findById(request.promotionId())
						.orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khuyến mãi ID: " + request.promotionId())))
				: promotionRepository.findCurrentlyActive(now);
		List<CartLine> lines = hydrateLines(request.lines());
		BigDecimal subtotal = request.subtotal() != null ? request.subtotal() : sumSubtotal(lines);
		BigDecimal shippingFee = request.shippingFee() != null ? request.shippingFee().max(BigDecimal.ZERO) : BigDecimal.ZERO;
		return candidates.stream()
				.map(p -> evaluateOne(p, lines, subtotal, shippingFee, now))
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
				.comparing((PromotionEvaluationResponse r) -> nvl(r.discountAmount()).add(nvl(r.shippingDiscountAmount())), Comparator.reverseOrder())
				.thenComparing(r -> nvl(r.discountAmount()).compareTo(BigDecimal.ZERO) > 0 ? 0 : 1)
				.thenComparing(r -> promotionEndDate(r.promotionId()))
				.thenComparing(r -> parseId(r.promotionId()), Comparator.nullsLast(Comparator.naturalOrder()));
	}

	private LocalDateTime promotionEndDate(String promotionId) {
		Long id = parseId(promotionId);
		if (id == null) return LocalDateTime.MAX;
		return promotionRepository.findById(id).map(Promotion::getEndDate).orElse(LocalDateTime.MAX);
	}

	private PromotionEvaluationResponse evaluateOne(
			Promotion p,
			List<CartLine> lines,
			BigDecimal subtotal,
			BigDecimal shippingFee,
			LocalDateTime now
	) {
		if (!Boolean.TRUE.equals(p.getActive()) || now.isBefore(p.getStartDate()) || now.isAfter(p.getEndDate())) {
			return ineligible(p, "Ngoài thời gian áp dụng");
		}
		if (subtotal.compareTo(nvl(p.getMinOrderValue())) < 0) {
			return ineligible(p, "Chưa đạt đơn tối thiểu");
		}
		List<CartLine> scoped = scopedLines(p, lines);
		if (scoped.isEmpty()) {
			return ineligible(p, "Không đúng phạm vi áp dụng");
		}
		BigDecimal scopedSubtotal = sumSubtotal(scoped);
		return switch (p.getType()) {
			case "PERCENT_DISCOUNT" -> evalPercent(p, scoped, scopedSubtotal);
			case "FIXED_DISCOUNT" -> evalFixed(p, scoped, scopedSubtotal);
			case "FREE_SHIPPING" -> evalFreeShipping(p, scoped, shippingFee);
			case "BUY_X_GET_Y" -> evalBuyXGetY(p, scoped);
			case "QUANTITY_GIFT" -> evalQuantityGift(p, scoped);
			default -> ineligible(p, "Loại khuyến mãi không hỗ trợ");
		};
	}

	private PromotionEvaluationResponse evalPercent(Promotion p, List<CartLine> scoped, BigDecimal scopedSubtotal) {
		BigDecimal amount = scopedSubtotal.multiply(nvl(p.getDiscountValue()))
				.divide(BigDecimal.valueOf(100), 0, RoundingMode.HALF_UP);
		if (p.getMaxDiscount() != null && p.getMaxDiscount().compareTo(BigDecimal.ZERO) > 0) {
			amount = amount.min(p.getMaxDiscount());
		}
		if (amount.compareTo(BigDecimal.ZERO) <= 0) return ineligible(p, "Chưa có giá trị giảm hợp lệ");
		return eligible(p, amount, BigDecimal.ZERO, affected(scoped, amount, null), List.of());
	}

	private PromotionEvaluationResponse evalFixed(Promotion p, List<CartLine> scoped, BigDecimal scopedSubtotal) {
		BigDecimal amount = nvl(p.getDiscountValue()).min(scopedSubtotal).max(BigDecimal.ZERO);
		if (amount.compareTo(BigDecimal.ZERO) <= 0) return ineligible(p, "Chưa có giá trị giảm hợp lệ");
		return eligible(p, amount, BigDecimal.ZERO, affected(scoped, amount, null), List.of());
	}

	private PromotionEvaluationResponse evalFreeShipping(Promotion p, List<CartLine> scoped, BigDecimal shippingFee) {
		if (shippingFee.compareTo(BigDecimal.ZERO) <= 0) return ineligible(p, "Chưa có phí ship để áp dụng");
		BigDecimal cap = p.getMaxDiscount() != null && p.getMaxDiscount().compareTo(BigDecimal.ZERO) > 0
				? p.getMaxDiscount()
				: shippingFee;
		BigDecimal shippingDiscount = shippingFee.min(cap).max(BigDecimal.ZERO);
		return eligible(p, BigDecimal.ZERO, shippingDiscount, affected(scoped, BigDecimal.ZERO, "eligible for free shipping"), List.of());
	}

	private PromotionEvaluationResponse evalBuyXGetY(Promotion p, List<CartLine> scoped) {
		if (p.getBuyQty() == null || p.getBuyQty() <= 0 || p.getGetQty() == null || p.getGetQty() <= 0 || p.getGetProductId() == null) {
			return ineligible(p, "Khuyến mãi cấu hình chưa đầy đủ");
		}
		int eligibleQty = scoped.stream().mapToInt(CartLine::qty).sum();
		int times = eligibleQty / p.getBuyQty();
		if (times <= 0) return ineligible(p, "Chưa đủ số lượng sản phẩm điều kiện");
		int giftQty = times * p.getGetQty();
		GiftValidation gift = validateGift(p, giftQty);
		if (!gift.valid()) return ineligible(p, gift.reason());
		return eligible(p, BigDecimal.ZERO, BigDecimal.ZERO, affected(scoped, BigDecimal.ZERO, "reward eligible"), giftLines(p, giftQty, gift.product(), gift.variant()));
	}

	private PromotionEvaluationResponse evalQuantityGift(Promotion p, List<CartLine> scoped) {
		if (p.getMinBuyQty() == null || p.getMinBuyQty() <= 0 || p.getGetQty() == null || p.getGetQty() <= 0 || p.getGetProductId() == null) {
			return ineligible(p, "Khuyến mãi cấu hình chưa đầy đủ");
		}
		int eligibleQty = scoped.stream().mapToInt(CartLine::qty).sum();
		if (eligibleQty < p.getMinBuyQty()) return ineligible(p, "Chưa đủ số lượng sản phẩm điều kiện");
		if (p.getMaxBuyQty() != null && eligibleQty > p.getMaxBuyQty()) return ineligible(p, "Vượt giới hạn số lượng áp dụng");
		GiftValidation gift = validateGift(p, p.getGetQty());
		if (!gift.valid()) return ineligible(p, gift.reason());
		return eligible(p, BigDecimal.ZERO, BigDecimal.ZERO, affected(scoped, BigDecimal.ZERO, "gift eligible"), giftLines(p, p.getGetQty(), gift.product(), gift.variant()));
	}

	private GiftValidation validateGift(Promotion p, int qty) {
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
		int stockQty = variant.getStockQty() != null ? variant.getStockQty() : 0;
		if (stockQty < qty) {
			return GiftValidation.invalid("Không đủ tồn quà tặng — cần " + qty + ", còn " + stockQty);
		}
		return new GiftValidation(true, null, product, variant);
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

	private PromotionEvaluationResponse eligible(Promotion p, BigDecimal discount, BigDecimal shippingDiscount,
												 List<PromotionAffectedLineDto> affectedLines, List<GiftLineSnapshotDto> giftLines) {
		return new PromotionEvaluationResponse(String.valueOf(p.getId()), p.getName(), p.getType(), p.getDescription(),
				true, null, discount, shippingDiscount, BigDecimal.ZERO, affectedLines, giftLines);
	}

	private PromotionEvaluationResponse ineligible(Promotion p, String reason) {
		return new PromotionEvaluationResponse(String.valueOf(p.getId()), p.getName(), p.getType(), p.getDescription(),
				false, reason, BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO, List.of(), List.of());
	}

	private List<PromotionAffectedLineDto> affected(List<CartLine> lines, BigDecimal totalDiscount, String note) {
		BigDecimal perLine = lines.isEmpty() || totalDiscount.compareTo(BigDecimal.ZERO) <= 0
				? BigDecimal.ZERO
				: totalDiscount.divide(BigDecimal.valueOf(lines.size()), 0, RoundingMode.DOWN);
		List<PromotionAffectedLineDto> out = new ArrayList<>();
		for (CartLine line : lines) {
			out.add(new PromotionAffectedLineDto(line.id(), String.valueOf(line.product().getId()),
					line.variant() != null ? String.valueOf(line.variant().getId()) : null,
					line.product().getName(), line.variant() != null ? line.variant().getVariantName() : null,
					line.qty(), perLine, null, note));
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
			if (product == null) throw new EntityNotFoundException("Không tìm thấy sản phẩm ID: " + line.productId());
			ProductVariant variant = line.variantId() == null
					? variantRepository.findByProductIdAndIsDefaultTrue(product.getId()).orElse(null)
					: variantRepository.findById(line.variantId()).orElse(null);
			BigDecimal unitPrice = line.unitPrice() != null
					? line.unitPrice()
					: (variant != null && variant.getSellPrice() != null ? variant.getSellPrice() : BigDecimal.ZERO);
			BigDecimal subtotal = line.lineSubtotal() != null
					? line.lineSubtotal()
					: unitPrice.multiply(BigDecimal.valueOf(line.qty()));
			return new CartLine(line.id() != null && !line.id().isBlank() ? line.id() : String.valueOf(product.getId()),
					product, variant, line.qty(), subtotal);
		}).toList();
	}

	private List<CartLine> scopedLines(Promotion p, List<CartLine> lines) {
		String scope = p.getAppliesTo();
		if (scope == null || "ALL".equals(scope)) return lines;
		if ("PRODUCT".equals(scope)) {
			var ids = p.getProducts().stream().map(Product::getId).collect(Collectors.toSet());
			return lines.stream().filter(l -> ids.contains(l.product().getId())).toList();
		}
		if ("CATEGORY".equals(scope)) {
			var ids = p.getCategories().stream().map(c -> c.getId()).collect(Collectors.toSet());
			return lines.stream()
					.filter(l -> l.product().getCategory() != null && ids.contains(l.product().getCategory().getId()))
					.toList();
		}
		return lines;
	}

	private BigDecimal sumSubtotal(List<CartLine> lines) {
		return lines.stream().map(CartLine::lineSubtotal).reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private BigDecimal nvl(BigDecimal value) { return value != null ? value : BigDecimal.ZERO; }

	private Long parseId(String id) {
		try { return id == null ? null : Long.parseLong(id); }
		catch (NumberFormatException ex) { return null; }
	}

	private record CartLine(String id, Product product, ProductVariant variant, int qty, BigDecimal lineSubtotal) {}

	private record GiftValidation(boolean valid, String reason, Product product, ProductVariant variant) {
		static GiftValidation invalid(String reason) {
			return new GiftValidation(false, reason, null, null);
		}
	}
}


