package com.example.nhadanshop.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/** Utility class chuyển đổi Entity → Response DTO */
public final class DtoMapper {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private DtoMapper() {}

    // ── Category ───────────────────────────────────────────────────────────────
    public static CategoryResponse toResponse(Category c) {
        return new CategoryResponse(
                c.getId(), c.getName(), c.getDescription(), c.getActive(),
                c.getCreatedAt(), c.getUpdatedAt()
        );
    }

    // ── Product ───────────────────────────────────────────────────────────────
    public static ProductResponse toResponse(Product p) {
        List<ProductVariantResponse> variants = p.getVariants() == null
                ? Collections.emptyList()
                : p.getVariants().stream().map(DtoMapper::toResponse).collect(Collectors.toList());
        return new ProductResponse(
                p.getId(), p.getCode(), p.getName(), p.getActive(),
                p.getCategory().getId(), p.getCategory().getName(),
                p.getProductType() != null ? p.getProductType().name() : "SINGLE",
                p.getImageUrl(),
                p.getCreatedAt(), p.getUpdatedAt(),
                variants
        );
    }

    // ── ProductVariant ────────────────────────────────────────────────────────
    public static ProductVariantResponse toResponse(ProductVariant v) {
        return new ProductVariantResponse(
                v.getId(),
                v.getProduct().getId(),
                v.getProduct().getCode(),
                v.getProduct().getName(),
                v.getVariantCode(),
                v.getVariantName(),
                v.getSellUnit(),
                v.getImportUnit(),
                v.getPiecesPerUnit(),
                v.getSellPrice(),
                v.getCostPrice(),
                v.getStockQty(),
                v.getMinStockQty(),
                v.isLowStock(),
                v.getExpiryDays(),
                v.getActive(),
                v.getIsSellable(),
                v.getIsDefault(),
                v.getImageUrl(),
                v.getConversionNote(),
                v.getCreatedAt(),
                v.getUpdatedAt()
        );
    }

    // ── SalesInvoice ──────────────────────────────────────────────────────────
    public static SalesInvoiceResponse toResponse(SalesInvoice inv) {
        BigDecimal discountAmount = inv.getDiscountAmount() != null ? inv.getDiscountAmount() : BigDecimal.ZERO;
        BigDecimal finalAmount    = inv.getTotalAmount().subtract(discountAmount);
        ShippingAddressDto shippingAddress = readJson(inv.getShippingAddressJson(), new TypeReference<>() {});
        List<GiftLineSnapshotDto> giftLines = readJsonList(inv.getGiftLinesSnapshotJson(), new TypeReference<>() {});
        PromotionSnapshotDto promotionSnapshot = readJson(inv.getPromotionSnapshotJson(), new TypeReference<>() {});
        VoucherSnapshotDto voucherSnapshot = readJson(inv.getVoucherSnapshotJson(), new TypeReference<>() {});
        ShippingQuoteSnapshotDto shippingQuoteSnapshot = readJson(inv.getShippingQuoteSnapshotJson(), new TypeReference<>() {});
        PricingBreakdownSnapshotDto pricingBreakdownSnapshot = readJson(inv.getPricingBreakdownSnapshotJson(), new TypeReference<>() {});

        BigDecimal itemRevenue = BigDecimal.ZERO;
        BigDecimal itemCogs = BigDecimal.ZERO;
        BigDecimal itemGrossProfit = BigDecimal.ZERO;
        BigDecimal totalProfit = BigDecimal.ZERO;
        BigDecimal shipFee = BigDecimal.ZERO;
        BigDecimal shipDiscSnap = BigDecimal.ZERO;
        BigDecimal shipNet = BigDecimal.ZERO;
        BigDecimal shippingActualCost = null;
        BigDecimal shippingProfit = null;
        String invoiceProfitBasis = "shipping_actual_cost_unknown";
        if (inv.isCancelled()) {
            invoiceProfitBasis = "cancelled";
        } else {
            List<SalesInvoiceItem> lines = inv.getItems() != null ? inv.getItems() : List.of();
            for (SalesInvoiceItem i : lines) {
                BigDecimal q = BigDecimal.valueOf(i.getQuantity());
                itemRevenue = itemRevenue.add(nz(i.getUnitPrice()).multiply(q));
                itemCogs = itemCogs.add(nz(i.getUnitCostSnapshot()).multiply(q));
            }
            itemGrossProfit = itemRevenue.subtract(itemCogs);
            if (pricingBreakdownSnapshot != null) {
                shipFee = nz(pricingBreakdownSnapshot.shippingFee());
                shipDiscSnap = nz(pricingBreakdownSnapshot.shippingDiscount());
            }
            shipNet = shipFee.subtract(shipDiscSnap);
            BigDecimal merchDisc = nz(inv.getDiscountAmount()).subtract(shipDiscSnap);
            if (merchDisc.compareTo(BigDecimal.ZERO) < 0) {
                merchDisc = BigDecimal.ZERO;
            }
            totalProfit = itemGrossProfit.subtract(merchDisc).add(shipNet);
        }

        return new SalesInvoiceResponse(
                inv.getId(), inv.getInvoiceNo(), inv.getInvoiceDate(),
                inv.getCustomerName(),
                inv.getCustomer() != null ? inv.getCustomer().getId() : null,
                inv.getCustomerPhone(),
                shippingAddress,
                inv.getPaymentMethod(),
                inv.getNote(),
                inv.getTotalAmount(), discountAmount, finalAmount,
                inv.getPromotionName(), totalProfit,
                inv.getCreatedBy() != null ? inv.getCreatedBy().getUsername() : null,
                inv.getItems() == null ? List.of() : inv.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
                inv.getCreatedAt(), inv.getUpdatedAt(),
                // cancel fields
                inv.getStatus() != null ? inv.getStatus().name() : "COMPLETED",
                inv.getCancelledAt(), inv.getCancelledBy(), inv.getCancelReason(),
                mapSourceType(inv.getSourceType()),
                inv.getPendingOrderId() != null ? String.valueOf(inv.getPendingOrderId()) : null,
                giftLines,
                promotionSnapshot,
                voucherSnapshot,
                shippingQuoteSnapshot,
                pricingBreakdownSnapshot,
                inv.getVatPercent() != null ? inv.getVatPercent() : BigDecimal.ZERO,
                itemRevenue,
                itemCogs,
                itemGrossProfit,
                shipFee,
                shipDiscSnap,
                shipNet,
                shippingActualCost,
                shippingProfit,
                invoiceProfitBasis
        );
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    // ── SalesInvoiceItem ──────────────────────────────────────────────────────
    public static SalesInvoiceItemResponse toResponse(SalesInvoiceItem item) {
        BigDecimal lineTotal = item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
        BigDecimal profit    = item.getUnitPrice()
                .subtract(item.getUnitCostSnapshot())
                .multiply(BigDecimal.valueOf(item.getQuantity()));
        BigDecimal origPrice = item.getOriginalUnitPrice() != null ? item.getOriginalUnitPrice() : item.getUnitPrice();
        BigDecimal lineDsc   = item.getLineDiscountPercent() != null ? item.getLineDiscountPercent() : BigDecimal.ZERO;
        ProductVariant v = item.getVariant();
        return new SalesInvoiceItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProduct().getCode(),
                item.getProduct().getName(),
                item.getQuantity(),
                origPrice, lineDsc,
                item.getUnitPrice(),
                item.getUnitCostSnapshot(),
                lineTotal, profit,
                v != null ? v.getId()          : null,
                v != null ? v.getVariantCode() : item.getProduct().getCode(),
                v != null ? v.getVariantName() : item.getProduct().getName(),
                v != null ? v.getSellUnit()    : "cai",
                // Combo KiotViet fields
                item.getComboSourceId(),
                null,  // comboSourceCode — enriched ở tầng FE hoặc query riêng
                null,  // comboSourceName — enriched ở tầng FE hoặc query riêng
                item.getComboUnitPrice(),
                toAllocationResponses(item),
                item.isRewardLine()
        );
    }

    private static List<SalesInvoiceItemAllocationResponse> toAllocationResponses(SalesInvoiceItem item) {
        List<SalesInvoiceItemBatchAllocation> all = item.getBatchAllocations();
        if (all == null || all.isEmpty()) {
            return List.of();
        }
        return all.stream().map(DtoMapper::toAllocationResponse).collect(Collectors.toList());
    }

    private static SalesInvoiceItemAllocationResponse toAllocationResponse(SalesInvoiceItemBatchAllocation a) {
        ProductBatch b = a.getBatch();
        if (b == null) {
            throw new IllegalStateException("Phân bổ lô hóa đơn thiếu batch.");
        }
        String code = b.getBatchCode();
        int q = a.getDeductedQty() != null ? a.getDeductedQty() : 0;
        return new SalesInvoiceItemAllocationResponse(b.getId(), code, code, q);
    }

    // ── InventoryReceipt ──────────────────────────────────────────────────────
    public static InventoryReceiptResponse toResponse(InventoryReceipt r, ReceiptDeleteEligibility eligibility) {
        String st = r.getStatus() != null ? r.getStatus() : InventoryReceipt.STATUS_CONFIRMED;
        return new InventoryReceiptResponse(
                r.getId(), r.getReceiptNo(), r.getReceiptDate(),
                r.getSupplierName(),
                r.getSupplier() != null ? r.getSupplier().getId() : null, // supplierId Sprint 1
                r.getNote(), r.getTotalAmount(),
                r.getShippingFee()  != null ? r.getShippingFee()  : BigDecimal.ZERO,
                r.getTotalVat()     != null ? r.getTotalVat()     : BigDecimal.ZERO,
                r.getCreatedBy() != null ? r.getCreatedBy().getUsername() : null,
                r.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
                r.getCreatedAt(), r.getUpdatedAt(),
                st,
                eligibility.canDelete(),
                eligibility.deleteBlockReason(),
                r.getVoidedAt(),
                r.getVoidedBy(),
                r.getVoidReason()
        );
    }

    // ── InventoryReceiptItem ──────────────────────────────────────────────────
    public static InventoryReceiptItemResponse toResponse(InventoryReceiptItem item) {
        BigDecimal lineTotal = item.getUnitCost().multiply(BigDecimal.valueOf(item.getQuantity()));
        BigDecimal vat   = item.getVatPercent()      != null ? item.getVatPercent()      : BigDecimal.ZERO;
        BigDecimal vatAl = item.getVatAllocated()     != null ? item.getVatAllocated()     : BigDecimal.ZERO;
        BigDecimal fcVat = item.getFinalCostWithVat() != null ? item.getFinalCostWithVat() : item.getFinalCost();
        ProductVariant v = item.getVariant();
        return new InventoryReceiptItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProduct().getCode(),
                item.getProduct().getName(),
                item.getQuantity(),
                item.getUnitCost(),
                item.getDiscountPercent(),
                item.getDiscountedCost(),
                vat, vatAl,
                item.getShippingAllocated(),
                item.getFinalCost(), fcVat,
                lineTotal,
                item.getImportUnitUsed(),
                item.getPiecesUsed()     != null ? item.getPiecesUsed()     : 1,
                item.getRetailQtyAdded() != null ? item.getRetailQtyAdded() : item.getQuantity(),
                v != null ? v.getId()          : null,
                v != null ? v.getVariantCode() : item.getProduct().getCode(),
                v != null ? v.getVariantName() : item.getProduct().getName(),
                v != null ? v.getSellUnit()    : "cai"
        );
    }

    // ── User ─────────────────────────────────────────────────────────────────
    public static UserResponse toResponse(User u) {
        return new UserResponse(
                u.getId(), u.getUsername(), u.getFullName(), u.getActive(),
                u.getRoles().stream().map(Role::getName).collect(Collectors.toSet()),
                u.getCreatedAt(), u.getUpdatedAt()
        );
    }

    private static String mapSourceType(SalesInvoice.SourceType sourceType) {
        if (sourceType == null) return null;
        return switch (sourceType) {
            case POS -> "pos";
            case ONLINE_PENDING -> "online_pending";
            case MANUAL -> "manual";
        };
    }

    private static <T> T readJson(String value, TypeReference<T> typeReference) {
        if (value == null || value.isBlank()) return null;
        try {
            return OBJECT_MAPPER.readValue(value, typeReference);
        } catch (Exception e) {
            throw new IllegalStateException("Không thể deserialize invoice snapshot", e);
        }
    }

    private static <T> List<T> readJsonList(String value, TypeReference<List<T>> typeReference) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return OBJECT_MAPPER.readValue(value, typeReference);
        } catch (Exception e) {
            throw new IllegalStateException("Không thể deserialize invoice snapshot list", e);
        }
    }
}
