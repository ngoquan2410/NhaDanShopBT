package com.example.nhadanshop.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.dto.CommercialLineSnapshotDto;
import com.example.nhadanshop.dto.InvoiceItemRequest;
import com.example.nhadanshop.dto.PricingBreakdownSnapshotDto;
import com.example.nhadanshop.dto.PromotionSnapshotDto;
import com.example.nhadanshop.dto.SalesQuoteCapturedLineDto;
import com.example.nhadanshop.dto.SalesQuotePayloadDto;
import com.example.nhadanshop.dto.SalesInvoiceRequest;
import com.example.nhadanshop.dto.SalesInvoiceResponse;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.entity.PendingOrderItem;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.HashMap;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional
public class InvoiceService {

    private final SalesInvoiceRepository invoiceRepo;
    private final ProductRepository productRepo;
    private final UserRepository userRepo;
    private final InvoiceNumberGenerator numberGen;
    private final ProductBatchService batchService;
    private final ProductBatchRepository batchRepo;      // Issue 15: FEFO restore accurate
    private final PromotionRepository promotionRepo;
    private final ProductVariantService variantService;
    private final ProductVariantRepository variantRepo;
    private final ProductComboRepository comboItemRepo;
    private final ProductComboService comboService;
    private final CustomerRepository customerRepository;
    private final CustomerService customerService;
    private final StockMutationService stockMutationService;
    private final Clock clock;
    private final ObjectMapper objectMapper;
    private final SalesQuoteRepository salesQuoteRepository;
    private final CustomerLoyaltyService loyaltyService;

    @Transactional
    public SalesInvoiceResponse createInvoice(SalesInvoiceRequest req) {
        boolean quoteMode = req.quotePublicId() != null && !req.quotePublicId().isBlank();
        if (quoteMode) {
            return createInvoiceFromQuoteRequest(req);
        }
        if (req.items() == null || req.items().isEmpty()) {
            throw new IllegalArgumentException("Thieu dong ban hang (legacy invoice)");
        }
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(numberGen.nextInvoiceNo());
        invoice.setNote(req.note());
        invoice.setInvoiceDate(LocalDateTime.now(clock));

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(invoice::setCreatedBy);

        // Sprint 2: set customer FK + snapshot name
        if (req.customerId() != null) {
            customerRepository.findById(req.customerId()).ifPresent(customer -> {
                ActiveEntityGuards.requireActiveCustomerForBinding(customer, req.customerId());
                invoice.setCustomer(customer);
                invoice.setCustomerName(customer.getName()); // snapshot
            });
        }
        // Fallback: nhập tay tên KH (khách vãng lai)
        if (invoice.getCustomerName() == null && req.customerName() != null) {
            invoice.setCustomerName(req.customerName());
        }

        Promotion promo = null;
        if (req.promotionId() != null) {
            promo = promotionRepo.findById(req.promotionId()).orElse(null);
            if (promo == null || !promo.isCurrentlyActive()) {
                throw new IllegalArgumentException("Chuong trinh khuyen mai khong ton tai hoac da het han");
            }
        }

        BigDecimal totalAmount = BigDecimal.ZERO;
        List<SalesInvoiceItem> items = new ArrayList<>();

        // Tập hợp product_id bị ảnh hưởng để refresh combo virtual stock sau khi lưu
        Set<Long> affectedProductIds = new java.util.HashSet<>();

        for (InvoiceItemRequest itemReq : req.items()) {

            // ── Combo KiotViet: expand combo → nhiều line items ──────────────
            if (itemReq.comboId() != null) {
                totalAmount = totalAmount.add(
                    expandComboToItems(itemReq.comboId(), itemReq.quantity(),
                                       invoice, items, affectedProductIds));
                continue;
            }

            // ── Sản phẩm đơn (SINGLE) ────────────────────────────────────────
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Khong tim thay san pham ID: " + itemReq.productId()));

            if (!product.getActive())
                throw new IllegalArgumentException("San pham '" + product.getName() + "' da ngung kinh doanh");

            if (product.isCombo())
                throw new IllegalArgumentException(
                    "San pham '" + product.getName() + "' la combo. " +
                    "Vui long dung comboId de ban combo theo mo hinh KiotViet.");

            // [Sprint 0] Resolve variant — null variantId → dùng default variant
            ProductVariant variant = variantService.resolveVariant(itemReq.variantId(), product.getId(), true);
            Long variantId = variant.getId();
            variant = variantRepo.findByIdForUpdate(variantId)
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + variantId));

            if (itemReq.batchId() == null) {
                // Kiểm tra tồn kho theo variant (projection) — Slice 6B exact-batch path validates the batch row instead
                if (variant.getStockQty() < itemReq.quantity()) {
                    throw new IllegalArgumentException(
                            "San pham '" + product.getName() + "' [" + variant.getVariantCode() + "] " +
                            "khong du hang. Ton kho: " + variant.getStockQty() +
                            ", yeu cau: " + itemReq.quantity());
                }
            }

            ProductBatchService.DeductionResult deductionResult;
            if (itemReq.batchId() != null) {
                deductionResult = batchService.deductExactBatchWithTrace(
                        product.getId(), variant.getId(), itemReq.batchId(), itemReq.quantity());
            } else {
                // FEFO deduct theo variant_id
                deductionResult = batchService.deductStockFEFOWithTrace(
                        product.getId(), variant.getId(), itemReq.quantity());
            }
            affectedProductIds.add(product.getId());

            BigDecimal lineDiscPct = itemReq.discountPercent() != null ? itemReq.discountPercent() : BigDecimal.ZERO;
            BigDecimal discountFactor = BigDecimal.ONE.subtract(
                    lineDiscPct.divide(BigDecimal.valueOf(100), 10, RoundingMode.HALF_UP));
            BigDecimal actualUnitPrice = variant.getSellPrice()
                    .multiply(discountFactor).setScale(0, RoundingMode.HALF_UP);

            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(product);
            item.setVariant(variant); // [Sprint 0]
            item.setQuantity(itemReq.quantity());
            item.setOriginalUnitPrice(variant.getSellPrice());
            item.setLineDiscountPercent(lineDiscPct);
            item.setUnitPrice(actualUnitPrice);
            BigDecimal costSnap;
            if (itemReq.batchId() != null) {
                costSnap = deductionResult.averageCost();
            } else {
                costSnap = deductionResult.averageCost().compareTo(BigDecimal.ZERO) > 0
                        ? deductionResult.averageCost() : variant.getCostPrice();
            }
            item.setUnitCostSnapshot(costSnap);
            appendBatchAllocations(item, deductionResult.batchDeductions());
            // comboSourceId = null (bán lẻ thường)

            totalAmount = totalAmount.add(actualUnitPrice.multiply(BigDecimal.valueOf(itemReq.quantity())));
            items.add(item);
        }

        PricingBreakdownSnapshotDto directPricing = materializeDirectInvoiceCommercialSnapshot(items, totalAmount, promo);
        invoice.setPricingBreakdownSnapshotJson(writeJson(directPricing));
        invoice.setVatPercent(nvl(directPricing.vatPercent()));
        invoice.setTotalAmount(
                nvl(directPricing.subtotal())
                        .add(nvl(directPricing.shippingFee()))
                        .add(nvl(directPricing.vatAmount()))
        );
        invoice.getItems().addAll(items);
        if (req.paymentMethod() != null && !req.paymentMethod().isBlank()) {
            invoice.setPaymentMethod(req.paymentMethod());
        }

        if (promo != null) {
            invoice.setPromotionId(promo.getId());
            invoice.setPromotionName(promo.getName());
        }
        invoice.setDiscountAmount(
                nvl(directPricing.manualDiscount())
                        .add(nvl(directPricing.promotionDiscount()))
                        .add(nvl(directPricing.voucherDiscount()))
                        .add(nvl(directPricing.loyaltyDiscount()))
                        .add(nvl(directPricing.shippingDiscount()))
        );
        invoice.setLoyaltyDiscountAmount(nvl(directPricing.loyaltyDiscount()));
        invoice.setLoyaltyRedeemedPoints(directPricing.loyaltyRedeemedPoints() != null ? directPricing.loyaltyRedeemedPoints() : 0L);

        SalesInvoice saved = invoiceRepo.save(invoice);
        appendInvoiceDeductionMovements(saved);

        // ── Refresh virtual stock của tất cả combo chứa SP bị ảnh hưởng ──────
        affectedProductIds.forEach(comboService::refreshCombosContaining);

        // Sprint 2: cộng total_spend cho KH nếu có
        if (saved.getCustomer() != null) {
            customerService.addSpend(saved.getCustomer().getId(),
                    saved.getTotalAmount().subtract(saved.getDiscountAmount()));
        }
        loyaltyService.earnForInvoice(saved);

        return DtoMapper.toResponse(saved);
    }

    private PricingBreakdownSnapshotDto materializeDirectInvoiceCommercialSnapshot(
            List<SalesInvoiceItem> items,
            BigDecimal merchandiseSubtotal,
            Promotion promo
    ) {
        List<SalesInvoiceItem> billableItems = items.stream()
                .filter(i -> !i.isRewardLine())
                .toList();
        if (billableItems.isEmpty()) {
            throw new IllegalArgumentException("Hoa don truc tiep phai co it nhat mot dong tinh tien");
        }

        List<CommercialPricingEngine.BillableAllocationRow> allocationRows = new ArrayList<>();
        List<CommercialPricingEngine.PromoPricingLine> promoLines = new ArrayList<>();
        for (SalesInvoiceItem item : billableItems) {
            BigDecimal qty = BigDecimal.valueOf(item.getQuantity());
            BigDecimal gross = nvl(item.getOriginalUnitPrice()).multiply(qty).setScale(0, RoundingMode.HALF_UP);
            BigDecimal netBeforeInvoiceDiscount = nvl(item.getUnitPrice()).multiply(qty).setScale(0, RoundingMode.HALF_UP);
            Long categoryId = item.getProduct().getCategory() != null ? item.getProduct().getCategory().getId() : null;
            allocationRows.add(new CommercialPricingEngine.BillableAllocationRow(
                    item.getProduct().getId(),
                    categoryId,
                    gross,
                    netBeforeInvoiceDiscount
            ));
            promoLines.add(new CommercialPricingEngine.PromoPricingLine(item.getProduct(), netBeforeInvoiceDiscount));
        }

        CommercialPricingEngine.QuoteCommercialResult commercial =
                CommercialPricingEngine.computeMerchandiseQuoteAllocation(
                        merchandiseSubtotal,
                        BigDecimal.ZERO,
                        promo,
                        promoLines,
                        allocationRows,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        BigDecimal.ZERO
                );

        List<CommercialLineSnapshotDto> snapshots = commercial.billableLineSnapshots();
        for (int i = 0; i < billableItems.size(); i++) {
            applyCommercialSnapshot(billableItems.get(i), snapshots.get(i));
        }
        return commercial.breakdown();
    }

    /**
     * Quote mode: materialize invoice lines from persisted {@link SalesQuote} snapshot (no catalog price recompute).
     */
    @Transactional
    public SalesInvoiceResponse createInvoiceFromQuoteRequest(SalesInvoiceRequest req) {
        SalesQuote quote = salesQuoteRepository.findByPublicIdForUpdate(req.quotePublicId())
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay quote: " + req.quotePublicId()));
        if (quote.getConsumedPendingOrder() != null) {
            throw new IllegalStateException("Quote da gan don hang cho — khong tao hoa don truc tiep");
        }
        if (quote.getConsumedInvoice() != null) {
            throw new IllegalStateException("Quote da duoc su dung");
        }
        if (quote.isExpired(clock)) {
            throw new IllegalStateException("Quote da het han");
        }

        SalesQuotePayloadDto payload;
        try {
            payload = objectMapper.readValue(quote.getPayloadJson(), SalesQuotePayloadDto.class);
        } catch (Exception e) {
            throw new IllegalStateException("Khong doc duoc quote payload", e);
        }

        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(numberGen.nextInvoiceNo());
        invoice.setNote(req.note());
        invoice.setInvoiceDate(LocalDateTime.now(clock));
        invoice.setSourceType(mapQuoteSourceToInvoice(payload.source()));
        if (req.paymentMethod() != null && !req.paymentMethod().isBlank()) {
            invoice.setPaymentMethod(req.paymentMethod());
        }
        invoice.setPricingBreakdownSnapshotJson(writeJson(payload.pricingBreakdownSnapshot()));
        invoice.setPromotionSnapshotJson(writeJson(payload.promotionSnapshot()));
        invoice.setVoucherSnapshotJson(writeJson(payload.voucherSnapshot()));
        invoice.setShippingQuoteSnapshotJson(writeJson(payload.shippingQuoteSnapshot()));

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(invoice::setCreatedBy);

        if (req.customerId() != null) {
            customerRepository.findById(req.customerId()).ifPresent(customer -> {
                ActiveEntityGuards.requireActiveCustomerForBinding(customer, req.customerId());
                invoice.setCustomer(customer);
                invoice.setCustomerName(customer.getName());
            });
        }
        if (invoice.getCustomerName() == null && req.customerName() != null) {
            invoice.setCustomerName(req.customerName());
        }

        PricingBreakdownSnapshotDto pricing = payload.pricingBreakdownSnapshot();
        if (pricing == null) {
            throw new IllegalStateException("Quote thieu pricingBreakdownSnapshot");
        }
        invoice.setVatPercent(nvl(pricing.vatPercent()));
        invoice.setTotalAmount(
                nvl(pricing.subtotal())
                        .add(nvl(pricing.shippingFee()))
                        .add(nvl(pricing.vatAmount()))
        );
        invoice.setDiscountAmount(
                nvl(pricing.manualDiscount())
                        .add(nvl(pricing.promotionDiscount()))
                        .add(nvl(pricing.voucherDiscount()))
                        .add(nvl(pricing.loyaltyDiscount()))
                        .add(nvl(pricing.shippingDiscount()))
        );
        invoice.setLoyaltyDiscountAmount(nvl(pricing.loyaltyDiscount()));
        invoice.setLoyaltyRedeemedPoints(pricing.loyaltyRedeemedPoints() != null ? pricing.loyaltyRedeemedPoints() : 0L);

        PromotionSnapshotDto promoSnap = payload.promotionSnapshot();
        if (promoSnap != null) {
            invoice.setPromotionId(parseNullableLong(promoSnap.promotionId()));
            invoice.setPromotionName(promoSnap.name());
        }

        Set<Long> affectedProductIds = new java.util.HashSet<>();
        for (SalesQuoteCapturedLineDto line : payload.lines()) {
            appendCapturedQuoteLine(invoice, line, affectedProductIds);
        }
        for (SalesQuoteCapturedLineDto line : payload.rewardLines()) {
            appendCapturedQuoteLine(invoice, line, affectedProductIds);
        }

        SalesInvoice saved = invoiceRepo.save(invoice);
        quote.setConsumedAt(LocalDateTime.now(clock));
        quote.setConsumedInvoice(saved);
        salesQuoteRepository.save(quote);

        appendInvoiceDeductionMovements(saved);
        affectedProductIds.forEach(comboService::refreshCombosContaining);

        if (saved.getCustomer() != null) {
            customerService.addSpend(
                    saved.getCustomer().getId(),
                    saved.getTotalAmount().subtract(saved.getDiscountAmount())
            );
        }
        loyaltyService.earnForInvoice(saved);

        return DtoMapper.toResponse(saved);
    }

    private void appendCapturedQuoteLine(SalesInvoice invoice, SalesQuoteCapturedLineDto cap, Set<Long> affectedProductIds) {
        Product product = productRepo.findById(cap.productId())
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay san pham ID: " + cap.productId()));
        if (!product.getActive()) {
            throw new IllegalArgumentException("San pham '" + product.getName() + "' da ngung kinh doanh");
        }
        if (product.isCombo()) {
            if (cap.rewardLine()) {
                throw new IllegalArgumentException("Combo khong the la reward line tren quote");
            }
            expandComboFromCapturedQuoteLine(invoice, cap, affectedProductIds);
            return;
        }

        ProductVariant resolved = variantService.resolveVariant(cap.variantId(), product.getId(), true);
        ProductVariant variant = variantRepo.findByIdForUpdate(resolved.getId())
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay variant ID: " + resolved.getId()));

        if (!cap.rewardLine()) {
            if (cap.batchId() == null && variant.getStockQty() < cap.quantity()) {
                throw new IllegalArgumentException(
                        "Khong du hang variant " + variant.getVariantCode()
                                + ". Ton: " + variant.getStockQty() + ", can: " + cap.quantity());
            }
        } else if (variant.getStockQty() < cap.quantity()) {
            throw new IllegalArgumentException(
                    "Khong du hang reward variant " + variant.getVariantCode());
        }

        ProductBatchService.DeductionResult deductionResult;
        if (cap.batchId() != null) {
            deductionResult = batchService.deductExactBatchWithTrace(
                    product.getId(), variant.getId(), cap.batchId(), cap.quantity());
        } else {
            deductionResult = batchService.deductStockFEFOWithTrace(
                    product.getId(), variant.getId(), cap.quantity());
        }
        affectedProductIds.add(product.getId());

        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setInvoice(invoice);
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(cap.quantity());
        BigDecimal orig = cap.originalUnitPrice() != null ? cap.originalUnitPrice() : variant.getSellPrice();
        item.setOriginalUnitPrice(orig);
        BigDecimal lineDisc = cap.discountPercent() != null ? cap.discountPercent() : BigDecimal.ZERO;
        item.setLineDiscountPercent(lineDisc);
        item.setRewardLine(cap.rewardLine());
        if (cap.rewardLine()) {
            item.setUnitPrice(BigDecimal.ZERO);
        } else {
            item.setUnitPrice(cap.unitPrice());
        }
        BigDecimal costSnap = deductionResult.averageCost().compareTo(BigDecimal.ZERO) > 0
                ? deductionResult.averageCost()
                : variant.getCostPrice();
        item.setUnitCostSnapshot(costSnap);
        appendBatchAllocations(item, deductionResult.batchDeductions());
        applyCommercialSnapshot(item, cap.commercialSnapshot());
        invoice.getItems().add(item);
    }

    private String writeJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Không serialize snapshot", e);
        }
    }

    private void appendPendingOrderLine(
            SalesInvoice invoice,
            PendingOrderItem orderItem,
            Set<Long> affectedProductIds) {
        Product product = productRepo.findById(orderItem.getProduct().getId())
                .orElseThrow(() -> new EntityNotFoundException(
                        "Khong tim thay san pham ID: " + orderItem.getProduct().getId()));

        if (!product.getActive()) {
            throw new IllegalArgumentException("San pham '" + product.getName() + "' da ngung kinh doanh");
        }
        if (product.isCombo()) {
            if (orderItem.isRewardLine()) {
                throw new IllegalArgumentException("Combo reward line chua ho tro");
            }
            expandComboFromPendingOrderItem(orderItem, invoice, affectedProductIds);
            return;
        }

        Long variantId = orderItem.getVariant() != null ? orderItem.getVariant().getId() : null;
        ProductVariant resolvedVariant = variantService.resolveVariant(variantId, product.getId(), true);
        ProductVariant variant = variantRepo.findByIdForUpdate(resolvedVariant.getId())
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay variant ID: " + resolvedVariant.getId()));

        Long batchDbId = orderItem.getBatch() != null ? orderItem.getBatch().getId() : null;
        boolean reward = orderItem.isRewardLine();
        if (!reward && batchDbId == null && variant.getStockQty() < orderItem.getQuantity()) {
            throw new IllegalArgumentException(
                    "San pham '" + product.getName() + "' [" + variant.getVariantCode() + "] " +
                            "khong du hang. Ton kho: " + variant.getStockQty() +
                            ", yeu cau: " + orderItem.getQuantity());
        }
        if (reward && variant.getStockQty() < orderItem.getQuantity()) {
            throw new IllegalArgumentException(
                    "San pham '" + product.getName() + "' [reward] khong du hang. Ton kho: " + variant.getStockQty() +
                            ", yeu cau: " + orderItem.getQuantity());
        }

        ProductBatchService.DeductionResult deductionResult;
        if (batchDbId != null) {
            deductionResult = batchService.deductExactBatchWithTrace(
                    product.getId(), variant.getId(), batchDbId, orderItem.getQuantity());
        } else {
            deductionResult = batchService.deductStockFEFOWithTrace(
                    product.getId(), variant.getId(), orderItem.getQuantity());
        }
        affectedProductIds.add(product.getId());

        SalesInvoiceItem item = new SalesInvoiceItem();
        item.setInvoice(invoice);
        item.setProduct(product);
        item.setVariant(variant);
        item.setQuantity(orderItem.getQuantity());
        BigDecimal lineUnit = nvl(orderItem.getUnitPrice());
        BigDecimal orig = orderItem.getOriginalUnitPrice() != null
                ? orderItem.getOriginalUnitPrice()
                : (reward ? variant.getSellPrice() : lineUnit);
        item.setOriginalUnitPrice(orig);
        item.setLineDiscountPercent(BigDecimal.ZERO);
        item.setRewardLine(reward);
        item.setUnitPrice(reward ? BigDecimal.ZERO : lineUnit);
        item.setUnitCostSnapshot(deductionResult.averageCost().compareTo(BigDecimal.ZERO) > 0
                ? deductionResult.averageCost() : variant.getCostPrice());
        appendBatchAllocations(item, deductionResult.batchDeductions());
        applyCommercialFromPendingOrderItem(item, orderItem);
        invoice.getItems().add(item);
    }

    private static void applyCommercialSnapshot(SalesInvoiceItem item, CommercialLineSnapshotDto snap) {
        if (snap == null) {
            return;
        }
        item.setLineGrossAmount(snap.lineGrossAmount());
        item.setLineOwnDiscountAmount(snap.lineOwnDiscountAmount());
        item.setLineNetBeforeInvoiceDiscount(snap.lineNetBeforeInvoiceDiscount());
        item.setAllocatedManualDiscount(snap.allocatedManualDiscount());
        item.setAllocatedPromotionDiscount(snap.allocatedPromotionDiscount());
        item.setAllocatedVoucherDiscount(snap.allocatedVoucherDiscount());
        item.setAllocatedLoyaltyDiscount(snap.allocatedLoyaltyDiscount());
        item.setAllocatedMerchandiseDiscount(snap.allocatedMerchandiseDiscount());
        item.setLineNetRevenue(snap.lineNetRevenue());
        item.setLineVatBase(snap.lineVatBase());
        item.setLineVatAmount(snap.lineVatAmount());
        item.setCommercialAllocationVersion(snap.commercialAllocationVersion());
    }

    private static void applyCommercialFromPendingOrderItem(SalesInvoiceItem item, PendingOrderItem orderItem) {
        if (orderItem.getCommercialAllocationVersion() == null) {
            return;
        }
        item.setLineGrossAmount(orderItem.getLineGrossAmount());
        item.setLineOwnDiscountAmount(orderItem.getLineOwnDiscountAmount());
        item.setLineNetBeforeInvoiceDiscount(orderItem.getLineNetBeforeInvoiceDiscount());
        item.setAllocatedManualDiscount(orderItem.getAllocatedManualDiscount());
        item.setAllocatedPromotionDiscount(orderItem.getAllocatedPromotionDiscount());
        item.setAllocatedVoucherDiscount(orderItem.getAllocatedVoucherDiscount());
        item.setAllocatedLoyaltyDiscount(orderItem.getAllocatedLoyaltyDiscount());
        item.setAllocatedMerchandiseDiscount(orderItem.getAllocatedMerchandiseDiscount());
        item.setLineNetRevenue(orderItem.getLineNetRevenue());
        item.setLineVatBase(orderItem.getLineVatBase());
        item.setLineVatAmount(orderItem.getLineVatAmount());
        item.setCommercialAllocationVersion(orderItem.getCommercialAllocationVersion());
    }

    /**
     * Finalizes quote consumption when confirming a {@link PendingOrder} that referenced the quote.
     * Reserved quotes (pending order preview) skip quote expiry re-validation — the order snapshot is authoritative (Slice 6C).
     */
    private void finalizeQuoteLinkedToPendingOrder(String quotePublicId, SalesInvoice saved, long pendingOrderId) {
        if (quotePublicId == null || quotePublicId.isBlank()) {
            return;
        }
        SalesQuote q = salesQuoteRepository.findByPublicIdForUpdate(quotePublicId).orElse(null);
        if (q == null) {
            return;
        }
        if (q.getConsumedInvoice() != null) {
            if (q.getConsumedInvoice().getId().equals(saved.getId())) {
                return;
            }
            throw new IllegalStateException("Quote da gan hoa don khac");
        }
        PendingOrder reservedFor = q.getConsumedPendingOrder();
        if (reservedFor != null) {
            if (!reservedFor.getId().equals(pendingOrderId)) {
                throw new IllegalStateException("Quote khong khop don hang dang xac nhan");
            }
        } else {
            if (q.getConsumedAt() != null) {
                throw new IllegalStateException("Quote trang thai tieu thu khong hop le");
            }
            if (q.isExpired(clock)) {
                throw new IllegalStateException("Quote da het han");
            }
            q.setConsumedAt(LocalDateTime.now(clock));
        }
        q.setConsumedInvoice(saved);
        salesQuoteRepository.save(q);
    }

    private static SalesInvoice.SourceType mapQuoteSourceToInvoice(String source) {
        if (source == null || source.isBlank()) {
            return SalesInvoice.SourceType.POS;
        }
        return switch (source.trim().toLowerCase(Locale.ROOT)) {
            case "storefront" -> SalesInvoice.SourceType.ONLINE_PENDING;
            case "admin" -> SalesInvoice.SourceType.MANUAL;
            case "pos" -> SalesInvoice.SourceType.POS;
            default -> SalesInvoice.SourceType.POS;
        };
    }

    @Transactional
    public SalesInvoice createInvoiceFromPendingOrder(
            PendingOrder order,
            String confirmedBy
    ) {
        SalesInvoice invoice = new SalesInvoice();
        invoice.setInvoiceNo(numberGen.nextInvoiceNo());
        invoice.setInvoiceDate(LocalDateTime.now(clock));
        invoice.setSourceType(SalesInvoice.SourceType.ONLINE_PENDING);
        invoice.setPendingOrderId(order.getId());
        invoice.setCustomerName(order.getCustomerName());
        invoice.setCustomerPhone(order.getCustomerPhone());
        invoice.setPaymentMethod(order.getPaymentMethod());
        invoice.setNote(buildPendingOrderInvoiceNote(order, confirmedBy));
        invoice.setShippingAddressJson(order.getShippingAddressJson());
        invoice.setGiftLinesSnapshotJson(order.getGiftLinesSnapshotJson());
        invoice.setPromotionSnapshotJson(order.getPromotionSnapshotJson());
        invoice.setVoucherSnapshotJson(order.getVoucherSnapshotJson());
        invoice.setShippingQuoteSnapshotJson(order.getShippingQuoteSnapshotJson());
        invoice.setPricingBreakdownSnapshotJson(order.getPricingBreakdownSnapshotJson());

        Authentication invoiceAuth = SecurityContextHolder.getContext().getAuthentication();
        if (invoiceAuth != null
                && invoiceAuth.isAuthenticated()
                && invoiceAuth.getName() != null
                && !"anonymousUser".equals(invoiceAuth.getName())) {
            userRepo.findByUsername(invoiceAuth.getName()).ifPresent(invoice::setCreatedBy);
        }

        Long customerId = parseNullableLong(order.getCustomerId());
        if (customerId != null) {
            customerRepository.findById(customerId).ifPresent(customer -> {
                ActiveEntityGuards.requireActiveCustomerForBinding(customer, customerId);
                invoice.setCustomer(customer);
            });
        }

        PromotionSnapshotDto promotionSnapshot = readJson(order.getPromotionSnapshotJson(), new TypeReference<>() {});
        if (promotionSnapshot != null) {
            invoice.setPromotionId(parseNullableLong(promotionSnapshot.promotionId()));
            invoice.setPromotionName(promotionSnapshot.name());
        }

        PricingBreakdownSnapshotDto pricing = readJson(order.getPricingBreakdownSnapshotJson(), new TypeReference<>() {});
        if (pricing == null) {
            throw new IllegalStateException("Pending order thiếu pricingBreakdownSnapshot để tạo hóa đơn");
        }

        invoice.setVatPercent(nvl(pricing.vatPercent()));
        invoice.setTotalAmount(
                nvl(pricing.subtotal())
                        .add(nvl(pricing.shippingFee()))
                        .add(nvl(pricing.vatAmount()))
        );
        invoice.setDiscountAmount(
                nvl(pricing.manualDiscount())
                        .add(nvl(pricing.promotionDiscount()))
                        .add(nvl(pricing.voucherDiscount()))
                        .add(nvl(pricing.loyaltyDiscount()))
                        .add(nvl(pricing.shippingDiscount()))
        );
        invoice.setLoyaltyDiscountAmount(nvl(pricing.loyaltyDiscount()));
        invoice.setLoyaltyRedeemedPoints(pricing.loyaltyRedeemedPoints() != null ? pricing.loyaltyRedeemedPoints() : 0L);

        Set<Long> affectedProductIds = new java.util.HashSet<>();
        for (PendingOrderItem orderItem : order.getItems()) {
            appendPendingOrderLine(invoice, orderItem, affectedProductIds);
        }

        SalesInvoice saved = invoiceRepo.save(invoice);

        if (order.getQuotePublicId() != null && !order.getQuotePublicId().isBlank()) {
            finalizeQuoteLinkedToPendingOrder(order.getQuotePublicId(), saved, order.getId());
        }

        appendInvoiceDeductionMovements(saved);
        affectedProductIds.forEach(comboService::refreshCombosContaining);

        if (saved.getCustomer() != null) {
            customerService.addSpend(
                    saved.getCustomer().getId(),
                    saved.getTotalAmount().subtract(saved.getDiscountAmount())
            );
        }

        return saved;
    }

    // ── Combo KiotViet: Expand combo → nhiều line items ───────────────────────

    /**
     * Expand 1 combo (comboQty lần) thành nhiều SalesInvoiceItem.
     * Mỗi thành phần → 1 invoice item riêng.
     * Tất cả item đều có combo_source_id = comboId để trace.
     * Giá bán từng item = 0 (combo được tính tổng ở combo level)
     * → Hóa đơn chỉ tính tiền theo giá combo: combQty × combo.sellPrice
     *
     * KiotViet model:
     *   - Ghi nhận kho: trừ từng thành phần × qty
     *   - Ghi nhận doanh thu: theo giá combo (không phải tổng thành phần)
     *   - Hiển thị HĐ: gom lại theo comboSourceId để show 1 dòng "Combo X × N"
     */
    private BigDecimal expandComboToItems(Long comboId, int comboQty,
                                           SalesInvoice invoice,
                                           List<SalesInvoiceItem> items,
                                           Set<Long> affectedProductIds) {
        return expandComboCore(
                comboId, comboQty, null, null, invoice, items, affectedProductIds, null, null);
    }

    private void expandComboFromPendingOrderItem(
            PendingOrderItem orderItem,
            SalesInvoice invoice,
            Set<Long> affectedProductIds) {
        Product combo = orderItem.getProduct();
        if (!combo.isCombo()) {
            throw new IllegalStateException("expandComboFromPendingOrderItem: san pham khong phai combo");
        }
        int comboQty = orderItem.getQuantity();
        BigDecimal totalComboRevenue =
                orderItem.getLineSubtotal() != null
                        && orderItem.getLineSubtotal().compareTo(BigDecimal.ZERO) > 0
                        ? orderItem.getLineSubtotal()
                        : nvl(orderItem.getUnitPrice()).multiply(BigDecimal.valueOf(comboQty));
        BigDecimal comboUnitSnap =
                orderItem.getUnitPrice() != null
                        ? orderItem.getUnitPrice()
                        : (comboQty > 0
                        ? totalComboRevenue.divide(BigDecimal.valueOf(comboQty), 0, RoundingMode.HALF_UP)
                        : BigDecimal.ZERO);
        expandComboCore(
                combo.getId(),
                comboQty,
                totalComboRevenue,
                comboUnitSnap,
                invoice,
                invoice.getItems(),
                affectedProductIds,
                orderItem,
                null);
    }

    private void expandComboFromCapturedQuoteLine(
            SalesInvoice invoice,
            SalesQuoteCapturedLineDto cap,
            Set<Long> affectedProductIds) {
        expandComboCore(
                cap.productId(),
                cap.quantity(),
                cap.lineSubtotal(),
                cap.unitPrice(),
                invoice,
                invoice.getItems(),
                affectedProductIds,
                null,
                cap.commercialSnapshot());
    }

    /**
     * Shared combo expansion: POS ({@code overrides null}), pending-order, or quote-captured line.
     */
    private BigDecimal expandComboCore(
            Long comboId,
            int comboQty,
            BigDecimal totalComboRevenueOverride,
            BigDecimal comboUnitPriceOverride,
            SalesInvoice invoice,
            List<SalesInvoiceItem> targetItems,
            Set<Long> affectedProductIds,
            PendingOrderItem pendingCommercialSource,
            CommercialLineSnapshotDto quoteCommercialSnapshot) {
        Product combo = productRepo.findById(comboId)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay combo ID: " + comboId));
        if (!combo.isCombo()) {
            throw new IllegalArgumentException("San pham ID " + comboId + " khong phai combo");
        }
        if (!combo.getActive()) {
            throw new IllegalArgumentException("Combo '" + combo.getName() + "' da ngung kinh doanh");
        }

        ProductVariant comboVariant = variantRepo.findByProductIdAndIsDefaultTrue(comboId)
                .orElseThrow(() -> new IllegalStateException(
                        "Combo '" + combo.getName() + "' chua co default variant. Vui long cap nhat combo."));
        BigDecimal comboSellPrice = comboVariant.getSellPrice();

        List<ProductComboItem> comboItems = comboItemRepo.findByComboProduct(combo);
        if (comboItems.isEmpty()) {
            throw new IllegalStateException("Combo '" + combo.getName() + "' chua co thanh phan nao");
        }

        for (ProductComboItem ci : comboItems) {
            Product component = ci.getProduct();
            ProductVariant compVariant = variantService.resolveVariant(null, component.getId(), false);
            int required = ci.getQuantity() * comboQty;
            if (compVariant.getStockQty() < required) {
                throw new IllegalArgumentException(
                        "Combo '" + combo.getName() + "': Thanh phan '" + component.getName() +
                                "' khong du hang. Can: " + required + ", ton kho: " + compVariant.getStockQty());
            }
        }

        BigDecimal totalComboRevenue = totalComboRevenueOverride != null
                ? totalComboRevenueOverride
                : comboSellPrice.multiply(BigDecimal.valueOf(comboQty));
        BigDecimal comboUnitSnap = comboUnitPriceOverride != null ? comboUnitPriceOverride : comboSellPrice;

        BigDecimal totalCost = comboItems.stream()
                .map(ci -> {
                    ProductVariant v = ci.getProduct().getDefaultVariant();
                    BigDecimal cost = v != null ? v.getCostPrice() : BigDecimal.ZERO;
                    return cost.multiply(BigDecimal.valueOf(ci.getQuantity()));
                })
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        for (int i = 0; i < comboItems.size(); i++) {
            ProductComboItem ci = comboItems.get(i);
            Product component = ci.getProduct();
            ProductVariant compVariant = variantService.resolveVariant(null, component.getId(), false);
            Long compVariantId = compVariant.getId();
            compVariant = variantRepo.findByIdForUpdate(compVariantId)
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy variant ID: " + compVariantId));
            int requiredQty = ci.getQuantity() * comboQty;

            ProductBatchService.DeductionResult deductionResult = batchService.deductStockFEFOWithTrace(
                    component.getId(), compVariant.getId(), requiredQty);
            affectedProductIds.add(component.getId());

            BigDecimal componentCost = totalCost.compareTo(BigDecimal.ZERO) > 0
                    ? compVariant.getCostPrice().multiply(BigDecimal.valueOf(ci.getQuantity()))
                    : BigDecimal.ZERO;
            BigDecimal allocRatio = totalCost.compareTo(BigDecimal.ZERO) > 0
                    ? componentCost.divide(totalCost, 10, RoundingMode.HALF_UP)
                    : BigDecimal.ONE.divide(BigDecimal.valueOf(comboItems.size()), 10, RoundingMode.HALF_UP);

            BigDecimal allocatedRevenue;
            if (i == comboItems.size() - 1) {
                BigDecimal alreadyAllocated = targetItems.stream()
                        .filter(it -> comboId.equals(it.getComboSourceId()))
                        .map(it -> it.getUnitPrice().multiply(BigDecimal.valueOf(it.getQuantity())))
                        .reduce(BigDecimal.ZERO, BigDecimal::add);
                allocatedRevenue = totalComboRevenue.subtract(alreadyAllocated)
                        .divide(BigDecimal.valueOf(requiredQty), 0, RoundingMode.HALF_UP);
            } else {
                allocatedRevenue = totalComboRevenue.multiply(allocRatio)
                        .divide(BigDecimal.valueOf(requiredQty), 0, RoundingMode.HALF_UP);
            }

            SalesInvoiceItem item = new SalesInvoiceItem();
            item.setInvoice(invoice);
            item.setProduct(component);
            item.setVariant(compVariant);
            item.setQuantity(requiredQty);
            item.setOriginalUnitPrice(compVariant.getSellPrice());
            item.setLineDiscountPercent(BigDecimal.ZERO);
            item.setUnitPrice(allocatedRevenue);
            item.setUnitCostSnapshot(deductionResult.averageCost().compareTo(BigDecimal.ZERO) > 0
                    ? deductionResult.averageCost() : compVariant.getCostPrice());
            appendBatchAllocations(item, deductionResult.batchDeductions());
            item.setComboSourceId(comboId);
            item.setComboUnitPrice(comboUnitSnap);
            if (i == 0 && pendingCommercialSource != null) {
                applyCommercialFromPendingOrderItem(item, pendingCommercialSource);
            } else if (i == 0 && quoteCommercialSnapshot != null) {
                applyCommercialSnapshot(item, quoteCommercialSnapshot);
            }
            targetItems.add(item);
        }

        return totalComboRevenue;
    }

    private String buildPendingOrderInvoiceNote(PendingOrder order, String confirmedBy) {
        String suffix = Stream.of(order.getNote())
                .filter(v -> v != null && !v.isBlank())
                .findFirst()
                .orElse(null);
        String base = "[" + order.getPaymentMethod() + "]";
        if (confirmedBy != null && !confirmedBy.isBlank()) {
            base = base + " [confirmedBy:" + confirmedBy.trim() + "]";
        }
        return suffix == null || suffix.isBlank() ? base : base + " " + suffix;
    }

    private Long parseNullableLong(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private <T> T readJson(String value, TypeReference<T> typeReference) {
        if (value == null || value.isBlank()) return null;
        try {
            return objectMapper.readValue(value, typeReference);
        } catch (Exception e) {
            throw new IllegalStateException("Không thể deserialize pending-order snapshot", e);
        }
    }

    private BigDecimal nvl(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    public SalesInvoiceResponse getInvoice(Long id) {
        return DtoMapper.toResponse(invoiceRepo.findByIdForResponse(id)
                .orElseThrow(() -> new EntityNotFoundException("Khong tim thay hoa don ID: " + id)));
    }

    public Page<SalesInvoiceResponse> listInvoices(Pageable pageable) {
        return listInvoices(pageable, null, null);
    }

    public Page<SalesInvoiceResponse> listInvoices(Pageable pageable, SalesInvoice.Status status, String query) {
        String q = (query != null && !query.isBlank()) ? query.trim() : null;
        Page<Long> invoiceIdPage = (status == null && q == null)
                ? invoiceRepo.findInvoiceIdsForList(pageable)
                : invoiceRepo.findInvoiceIdsForListFiltered(status, q, pageable);
        List<Long> invoiceIds = invoiceIdPage.getContent();
        if (invoiceIds.isEmpty()) {
            return Page.empty(pageable);
        }

        Map<Long, Integer> orderIndex = new HashMap<>();
        for (int i = 0; i < invoiceIds.size(); i++) {
            orderIndex.put(invoiceIds.get(i), i);
        }

        Map<Long, SalesInvoice> invoiceById = invoiceRepo.findAllByIdInForList(invoiceIds).stream()
                .sorted(java.util.Comparator.comparingInt(inv -> orderIndex.getOrDefault(inv.getId(), Integer.MAX_VALUE)))
                .collect(Collectors.toMap(SalesInvoice::getId, inv -> inv, (left, right) -> left, LinkedHashMap::new));

        List<SalesInvoiceResponse> responses = invoiceIds.stream()
                .map(invoiceById::get)
                .filter(Objects::nonNull)
                .map(DtoMapper::toResponse)
                .toList();

        return new PageImpl<>(responses, pageable, invoiceIdPage.getTotalElements());
    }

    public Page<SalesInvoiceResponse> listInvoicesByDateRange(LocalDateTime from, LocalDateTime to, Pageable pageable) {
        return invoiceRepo.findByInvoiceDateBetweenOrderByInvoiceDateDesc(from, to, pageable).map(DtoMapper::toResponse);
    }

    /** Sprint 2: lịch sử HĐ theo khách hàng */
    public Page<SalesInvoiceResponse> listInvoicesByCustomer(Long customerId, Pageable pageable) {
        return invoiceRepo.findByCustomerIdOrderByInvoiceDateDesc(customerId, pageable).map(DtoMapper::toResponse);
    }

    /**
     * Hard delete is not supported for business invoices. Only two statuses exist today:
     * {@link SalesInvoice.Status#COMPLETED} and {@link SalesInvoice.Status#CANCELLED}.
     * <p>
     * Phase 1 policy: use {@code PATCH /api/invoices/{id}/cancel} to void stock effect while
     * keeping the row and allocation history. Physical {@code DELETE} is rejected.
     */
    @Transactional
    public void deleteInvoice(Long id) {
        SalesInvoice inv = invoiceRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy hóa đơn ID: " + id));

        if (inv.isCancelled()) {
            throw new IllegalStateException(
                    "Hóa đơn " + inv.getInvoiceNo() + " đã bị hủy; không thể xóa vật lý. Hóa đơn đã hủy vẫn giữ lại cho đối soát.");
        }

        if (inv.getStatus() == SalesInvoice.Status.COMPLETED) {
            throw new IllegalStateException(
                    "Không thể xóa vật lý hóa đơn đã hoàn tất. Dùng PATCH /api/invoices/" + id
                            + "/cancel để hủy hóa đơn và hoàn tồn kho (giữ bản ghi lịch sử).");
        }

        throw new IllegalStateException("Không thể xóa hóa đơn ở trạng thái: " + inv.getStatus());
    }

    /**
     * Issue 14: Soft Cancel hóa đơn — không xóa vật lý.
     * - Đánh trạng thái CANCELLED + ghi audit
     * - Hoàn tồn kho (variant.stockQty + batch.remainingQty)
     * - Không giới hạn ngày (admin có thể hủy HĐ cũ)
     */
    @Transactional
    public SalesInvoiceResponse cancelInvoice(Long id, String reason, String actor) {
        SalesInvoice inv = invoiceRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy hóa đơn ID: " + id));

        if (inv.isCancelled()) {
            throw new IllegalStateException("Hóa đơn " + inv.getInvoiceNo() + " đã bị hủy trước đó (lúc "
                + (inv.getCancelledAt() != null ? inv.getCancelledAt().toLocalDate() : "?") + ").");
        }

        log.warn("[AUDIT-CANCEL] Hóa đơn={} | user={} | lý do={} | tổng={} ₫ | khách={}",
                inv.getInvoiceNo(), actor, reason,
                inv.getTotalAmount().subtract(inv.getDiscountAmount() != null ? inv.getDiscountAmount() : BigDecimal.ZERO),
                inv.getCustomerName() != null ? inv.getCustomerName() : "khách lẻ");

        // Đánh dấu CANCELLED
        inv.setStatus(SalesInvoice.Status.CANCELLED);
        inv.setCancelledAt(java.time.LocalDateTime.now(clock));
        inv.setCancelledBy(actor);
        inv.setCancelReason(reason != null && !reason.isBlank() ? reason.trim() : null);

        // Hoàn tồn kho
        Set<Long> affectedProductIds = new java.util.HashSet<>();
        for (SalesInvoiceItem item : inv.getItems()) {
            restoreStockFromAllocations(item);
            if (item.getVariant() != null) {
                stockMutationService.syncVariantStockWithBatches(item.getVariant().getId());
            }
            affectedProductIds.add(item.getProduct().getId());
        }

        invoiceRepo.save(inv);
        loyaltyService.reverseForInvoice(inv, reason);
        affectedProductIds.forEach(comboService::refreshCombosContaining);
        return DtoMapper.toResponse(inv);
    }

    private void appendBatchAllocations(SalesInvoiceItem item, List<ProductBatchService.BatchDeduction> deductions) {
        if (deductions == null || deductions.isEmpty()) {
            return;
        }
        for (ProductBatchService.BatchDeduction deduction : deductions) {
            SalesInvoiceItemBatchAllocation allocation = new SalesInvoiceItemBatchAllocation();
            allocation.setInvoiceItem(item);
            allocation.setBatch(batchRepo.getReferenceById(deduction.batchId()));
            allocation.setDeductedQty(deduction.deductedQty());
            item.getBatchAllocations().add(allocation);
        }
    }

    private void appendInvoiceDeductionMovements(SalesInvoice invoice) {
        if (invoice == null || invoice.getItems() == null || invoice.getItems().isEmpty()) {
            return;
        }
        String invoiceTrace = invoice.getId() != null
                ? "invoice:" + invoice.getId()
                : invoice.getInvoiceNo();
        for (SalesInvoiceItem item : invoice.getItems()) {
            if (item.getBatchAllocations() == null || item.getBatchAllocations().isEmpty()) {
                continue;
            }
            if (item.getVariant() == null || item.getVariant().getId() == null) {
                throw new IllegalStateException("Invoice item thiếu variant để ghi inventory movement");
            }
            String sourceId = item.getId() != null
                    ? invoiceTrace + ":item:" + item.getId()
                    : invoiceTrace;
            String note = "invoiceNo=" + invoice.getInvoiceNo();
            for (SalesInvoiceItemBatchAllocation allocation : item.getBatchAllocations()) {
                if (allocation.getBatch() == null || allocation.getBatch().getId() == null) {
                    throw new IllegalStateException("Allocation thiếu batch để ghi inventory movement");
                }
                if (allocation.getDeductedQty() == null || allocation.getDeductedQty() <= 0) {
                    throw new IllegalStateException("Allocation có deducted_qty không hợp lệ để ghi inventory movement");
                }
                stockMutationService.appendMovement(
                        item.getVariant().getId(),
                        allocation.getBatch().getId(),
                        -allocation.getDeductedQty(),
                        "invoice",
                        sourceId,
                        note);
            }
        }
    }

    private void restoreStockFromAllocations(SalesInvoiceItem item) {
        List<SalesInvoiceItemBatchAllocation> allocations = item.getBatchAllocations();
        if (allocations != null && !allocations.isEmpty()) {
            Map<Long, Integer> restoreQtyByBatchId = new HashMap<>();
            for (SalesInvoiceItemBatchAllocation allocation : allocations) {
                if (allocation.getBatch() == null || allocation.getBatch().getId() == null) {
                    throw new IllegalStateException("Allocation thiếu batch_id cho invoiceItem=" + item.getId());
                }
                if (allocation.getDeductedQty() == null || allocation.getDeductedQty() <= 0) {
                    throw new IllegalStateException("Allocation có deducted_qty không hợp lệ cho invoiceItem=" + item.getId());
                }
                restoreQtyByBatchId.merge(allocation.getBatch().getId(), allocation.getDeductedQty(), Integer::sum);
            }

            List<ProductBatch> lockedBatches = batchRepo.findAllByIdInForUpdate(new ArrayList<>(restoreQtyByBatchId.keySet()));
            if (lockedBatches.size() != restoreQtyByBatchId.size()) {
                throw new IllegalStateException("Không tìm đủ batch để hoàn tồn cho invoiceItem=" + item.getId());
            }

            for (ProductBatch batch : lockedBatches) {
                int restoreQty = restoreQtyByBatchId.getOrDefault(batch.getId(), 0);
                if (restoreQty > 0) {
                    batch.setRemainingQty(batch.getRemainingQty() + restoreQty);
                    batchRepo.save(batch);
                    appendInvoiceCancelMovement(item, batch, restoreQty);
                    log.debug("[LEDGER-RESTORE] invoiceItem={} batch={} +{} -> remaining={}",
                            item.getId(), batch.getBatchCode(), restoreQty, batch.getRemainingQty());
                }
            }
            return;
        }

        // Legacy invoice (before ledger rollout): fallback heuristic restore.
        Long productId = item.getProduct().getId();
        Long variantId = item.getVariant() != null ? item.getVariant().getId() : null;
        int qty = item.getQuantity();
        BigDecimal costSnapshot = item.getUnitCostSnapshot();

        List<com.example.nhadanshop.entity.ProductBatch> batches = variantId != null
                ? batchRepo.findByVariantIdAndRemainingQtyGreaterThanOrderByExpiryDateAsc(variantId, -1)
                : batchRepo.findByProductIdOrderByExpiryDateAsc(productId);

        if (batches.isEmpty()) {
            log.warn("[FEFO-RESTORE] Không tìm thấy batch: productId={} variantId={}", productId, variantId);
            return;
        }

        // Ưu tiên batch có costPrice khớp snapshot (đây là batch đã bị deduct)
        com.example.nhadanshop.entity.ProductBatch target = batches.stream()
                .filter(b -> costSnapshot != null && b.getCostPrice() != null
                        && b.getCostPrice().compareTo(costSnapshot) == 0)
                .findFirst()
                // Fallback: batch không expired gần nhất (LIFO để hoàn về lô mới nhất)
                .orElseGet(() -> batches.stream()
                        .filter(b -> !b.isExpired())
                        .reduce((a, b) -> b)  // lấy phần tử cuối = mới nhất
                        .orElse(batches.get(batches.size() - 1)));

        target.setRemainingQty(target.getRemainingQty() + qty);
        batchRepo.save(target);
        log.debug("[FEFO-RESTORE] batch={} variantId={} +{} → remaining={}",
                target.getBatchCode(), variantId, qty, target.getRemainingQty());
    }

    private void appendInvoiceCancelMovement(SalesInvoiceItem item, ProductBatch batch, int restoreQty) {
        if (item.getVariant() == null || item.getVariant().getId() == null) {
            throw new IllegalStateException("Invoice item thiếu variant để ghi cancel inventory movement");
        }
        SalesInvoice invoice = item.getInvoice();
        String invoiceTrace = invoice != null && invoice.getId() != null
                ? "invoice:" + invoice.getId()
                : "invoice";
        String sourceId = item.getId() != null
                ? invoiceTrace + ":item:" + item.getId() + ":cancel"
                : invoiceTrace + ":cancel";
        String note = invoice != null && invoice.getInvoiceNo() != null
                ? "cancel invoiceNo=" + invoice.getInvoiceNo()
                : "cancel invoice";
        stockMutationService.appendMovement(
                item.getVariant().getId(),
                batch.getId(),
                restoreQty,
                "invoice_cancel",
                sourceId,
                note);
    }
}


