package com.example.nhadanshop.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Objects;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** Utility class chuyển đổi Entity → Response DTO */
public final class DtoMapper {

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();
    private static final Logger log = LoggerFactory.getLogger(DtoMapper.class);

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
        return productResponse(p, variants);
    }

    /**
     * Build product response using an explicit variant list (e.g. after create, when the entity's lazy
     * {@code variants} bag may not reflect rows created in the same transaction).
     */
    private static ProductResponse productResponse(Product p, List<ProductVariantResponse> variants) {
        return new ProductResponse(
                p.getId(), p.getCode(), p.getName(), p.getActive(),
                p.getCategory().getId(), p.getCategory().getName(),
                p.getProductType() != null ? p.getProductType().name() : "SINGLE",
                p.getImageUrl(),
                p.getCreatedAt(), p.getUpdatedAt(),
                variants
        );
    }

    /**
     * Build product response using an explicit variant entity list (e.g. after create, when the entity's lazy
     * {@code variants} bag may not reflect rows created in the same transaction).
     */
    public static ProductResponse toResponse(Product p, List<ProductVariant> variantEntities) {
        List<ProductVariantResponse> variants = variantEntities == null || variantEntities.isEmpty()
                ? Collections.emptyList()
                : variantEntities.stream().map(DtoMapper::toResponse).collect(Collectors.toList());
        return productResponse(p, variants);
    }

    /** Same as {@link #toResponse(Product, List)} but variant rows are pre-built (e.g. sellable stock injected). */
    public static ProductResponse toResponseWithVariants(Product p, List<ProductVariantResponse> variantResponses) {
        return productResponse(p, variantResponses == null ? Collections.emptyList() : variantResponses);
    }

    public static PublicProductResponse toPublicResponse(Product p, List<PublicVariantResponse> variantResponses) {
        return new PublicProductResponse(
                p.getId(),
                p.getCode(),
                p.getName(),
                p.getCategory().getId(),
                p.getCategory().getName(),
                p.getProductType() != null ? p.getProductType().name() : "SINGLE",
                p.getImageUrl(),
                variantResponses == null ? Collections.emptyList() : variantResponses
        );
    }

    // ── ProductVariant ────────────────────────────────────────────────────────
    public static ProductVariantResponse toResponse(ProductVariant v) {
        return toResponse(v, null);
    }

    public static ProductVariantResponse toResponse(ProductVariant v, Integer sellableStockQty) {
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
                sellableStockQty,
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

    public static PublicVariantResponse toPublicResponse(ProductVariant v, int availableQty) {
        String status;
        if (availableQty <= 0) {
            status = "OUT_OF_STOCK";
        } else {
            Integer min = v.getMinStockQty();
            if (min != null && min > 0 && availableQty <= min) {
                status = "LOW_STOCK";
            } else {
                status = "IN_STOCK";
            }
        }
        return new PublicVariantResponse(
                v.getId(),
                v.getVariantCode(),
                v.getVariantName(),
                v.getSellUnit(),
                v.getSellPrice(),
                v.getImageUrl(),
                v.getIsDefault(),
                availableQty,
                status
        );
    }

    // ── SalesInvoice ──────────────────────────────────────────────────────────
    public static SalesInvoiceResponse toResponse(SalesInvoice inv) {
        return toResponse(inv, null);
    }

    /**
     * @param pendingOrderCode optional pending order canonical code, batch-resolved by the list path
     *                         to avoid N+1 lookups. Pass {@code null} from single-fetch sites.
     */
    public static SalesInvoiceResponse toResponse(SalesInvoice inv, String pendingOrderCode) {
        BigDecimal discountAmount = inv.getDiscountAmount() != null ? inv.getDiscountAmount() : BigDecimal.ZERO;
        BigDecimal finalAmount    = nz(inv.getTotalAmount()).subtract(discountAmount);
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
            boolean commercialLines = lines.stream()
                    .anyMatch(i -> i.getCommercialAllocationVersion() != null);
            for (SalesInvoiceItem i : lines) {
                BigDecimal q = BigDecimal.valueOf(i.getQuantity());
                BigDecimal lineCogs = nz(i.getUnitCostSnapshot()).multiply(q);
                BigDecimal lineNetRev;
                if (i.getCommercialAllocationVersion() != null) {
                    lineNetRev = i.getLineNetRevenue() != null
                            ? i.getLineNetRevenue()
                            : nz(i.getUnitPrice()).multiply(q);
                } else if (i.getLineNetRevenue() != null) {
                    lineNetRev = i.getLineNetRevenue();
                } else {
                    lineNetRev = nz(i.getUnitPrice()).multiply(q);
                }
                itemRevenue = itemRevenue.add(lineNetRev);
                itemCogs = itemCogs.add(lineCogs);
                itemGrossProfit = itemGrossProfit.add(lineNetRev.subtract(lineCogs));
            }
            if (pricingBreakdownSnapshot != null) {
                shipFee = nz(pricingBreakdownSnapshot.shippingFee());
                shipDiscSnap = nz(pricingBreakdownSnapshot.shippingDiscount());
            }
            shipNet = shipFee.subtract(shipDiscSnap);
            if (commercialLines) {
                totalProfit = itemGrossProfit.add(shipNet);
                invoiceProfitBasis = "commercial_line_allocation";
            } else {
                BigDecimal merchDisc = nz(inv.getDiscountAmount()).subtract(shipDiscSnap);
                if (merchDisc.compareTo(BigDecimal.ZERO) < 0) {
                    merchDisc = BigDecimal.ZERO;
                }
                totalProfit = itemGrossProfit.subtract(merchDisc).add(shipNet);
                invoiceProfitBasis = "invoice_discount_smear_legacy";
            }
        }

        return new SalesInvoiceResponse(
                inv.getId(), inv.getInvoiceNo(), inv.getInvoiceDate(),
                inv.getCustomerName(),
                inv.getCustomer() != null ? inv.getCustomer().getId() : null,
                inv.getCustomerPhone(),
                shippingAddress,
                inv.getPaymentMethod(),
                inv.getNote(),
                nz(inv.getTotalAmount()), discountAmount, finalAmount,
                inv.getPromotionName(), totalProfit,
                inv.getCreatedBy() != null ? inv.getCreatedBy().getUsername() : null,
                inv.getItems() == null ? List.of() : inv.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
                inv.getCreatedAt(), inv.getUpdatedAt(),
                // cancel fields
                inv.getStatus() != null ? inv.getStatus().name() : "COMPLETED",
                inv.getCancelledAt(), inv.getCancelledBy(), inv.getCancelReason(),
                mapSourceType(inv.getSourceType()),
                inv.getPendingOrderId() != null ? String.valueOf(inv.getPendingOrderId()) : null,
                pendingOrderCode,
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
        BigDecimal q = BigDecimal.valueOf(item.getQuantity() != null ? item.getQuantity() : 0);
        BigDecimal lineCogs = nz(item.getUnitCostSnapshot()).multiply(q);
        BigDecimal lineNetMerchRev;
        if (item.getCommercialAllocationVersion() != null) {
            lineNetMerchRev = item.getLineNetRevenue() != null
                    ? item.getLineNetRevenue()
                    : nz(item.getUnitPrice()).multiply(q);
        } else if (item.getLineNetRevenue() != null) {
            lineNetMerchRev = item.getLineNetRevenue();
        } else {
            lineNetMerchRev = nz(item.getUnitPrice()).multiply(q);
        }
        BigDecimal profit = lineNetMerchRev.subtract(lineCogs);
        BigDecimal lineTotal = nz(item.getUnitPrice()).multiply(q);
        BigDecimal origPrice = item.getOriginalUnitPrice() != null ? item.getOriginalUnitPrice() : item.getUnitPrice();
        BigDecimal lineDsc   = item.getLineDiscountPercent() != null ? item.getLineDiscountPercent() : BigDecimal.ZERO;
        ProductVariant v = item.getVariant();
        Product p = item.getProduct();
        return new SalesInvoiceItemResponse(
                item.getId(),
                p != null ? p.getId() : null,
                p != null ? p.getCode() : null,
                p != null ? p.getName() : null,
                item.getCategoryIdSnapshot(),
                item.getCategoryNameSnapshot(),
                item.getCategoryCodeSnapshot(),
                item.getQuantity() != null ? item.getQuantity() : 0,
                origPrice, lineDsc,
                item.getUnitPrice(),
                item.getUnitCostSnapshot(),
                lineTotal, profit,
                v != null ? v.getId()          : null,
                v != null ? v.getVariantCode() : p != null ? p.getCode() : null,
                v != null ? v.getVariantName() : p != null ? p.getName() : null,
                v != null ? v.getSellUnit()    : "cai",
                // Combo KiotViet fields
                item.getComboSourceId(),
                null,  // comboSourceCode — enriched ở tầng FE hoặc query riêng
                null,  // comboSourceName — enriched ở tầng FE hoặc query riêng
                item.getComboUnitPrice(),
                toAllocationResponses(item),
                item.isRewardLine(),
                commercialSnapshotFromInvoiceItem(item)
        );
    }

    private static CommercialLineSnapshotDto commercialSnapshotFromInvoiceItem(SalesInvoiceItem item) {
        if (item.getCommercialAllocationVersion() == null) {
            return null;
        }
        return new CommercialLineSnapshotDto(
                item.getLineGrossAmount(),
                item.getLineOwnDiscountAmount(),
                item.getLineNetBeforeInvoiceDiscount(),
                item.getAllocatedManualDiscount(),
                item.getAllocatedPromotionDiscount(),
                item.getAllocatedVoucherDiscount(),
                item.getAllocatedLoyaltyDiscount(),
                item.getAllocatedMerchandiseDiscount(),
                item.getLineNetRevenue(),
                item.getLineVatBase(),
                item.getLineVatAmount(),
                item.getCommercialAllocationVersion()
        );
    }

    /** Pending order line persisted commercial snapshot → API DTO. */
    static CommercialLineSnapshotDto commercialSnapshotFromPendingOrderItem(PendingOrderItem item) {
        if (item.getCommercialAllocationVersion() == null) {
            return null;
        }
        return new CommercialLineSnapshotDto(
                item.getLineGrossAmount(),
                item.getLineOwnDiscountAmount(),
                item.getLineNetBeforeInvoiceDiscount(),
                item.getAllocatedManualDiscount(),
                item.getAllocatedPromotionDiscount(),
                item.getAllocatedVoucherDiscount(),
                item.getAllocatedLoyaltyDiscount(),
                item.getAllocatedMerchandiseDiscount(),
                item.getLineNetRevenue(),
                item.getLineVatBase(),
                item.getLineVatAmount(),
                item.getCommercialAllocationVersion()
        );
    }

    private static List<SalesInvoiceItemAllocationResponse> toAllocationResponses(SalesInvoiceItem item) {
        List<SalesInvoiceItemBatchAllocation> all = item.getBatchAllocations();
        if (all == null || all.isEmpty()) {
            return List.of();
        }
        return all.stream().map(DtoMapper::toAllocationResponse).filter(Objects::nonNull).collect(Collectors.toList());
    }

    private static SalesInvoiceItemAllocationResponse toAllocationResponse(SalesInvoiceItemBatchAllocation a) {
        ProductBatch b = a.getBatch();
        if (b == null) {
            log.warn("Invoice item allocation {} is missing batch; returning degraded allocation list", a.getId());
            return null;
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
                r.getItems() == null ? List.of() : r.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
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
        int qty = item.getQuantity() != null ? item.getQuantity() : 0;
        BigDecimal unitCost = nz(item.getUnitCost());
        BigDecimal lineTotal = unitCost.multiply(BigDecimal.valueOf(qty));
        BigDecimal vat   = item.getVatPercent()      != null ? item.getVatPercent()      : BigDecimal.ZERO;
        BigDecimal vatAl = item.getVatAllocated()     != null ? item.getVatAllocated()     : BigDecimal.ZERO;
        BigDecimal fcVat = item.getFinalCostWithVat() != null ? item.getFinalCostWithVat() : item.getFinalCost();
        ProductVariant v = item.getVariant();
        Product p = item.getProduct();
        return new InventoryReceiptItemResponse(
                item.getId(),
                p != null ? p.getId() : null,
                p != null ? p.getCode() : null,
                p != null ? p.getName() : null,
                qty,
                unitCost,
                item.getDiscountPercent(),
                item.getDiscountedCost(),
                vat, vatAl,
                item.getShippingAllocated(),
                item.getFinalCost(), fcVat != null ? fcVat : BigDecimal.ZERO,
                lineTotal,
                item.getImportUnitUsed(),
                item.getPiecesUsed()     != null ? item.getPiecesUsed()     : 1,
                item.getRetailQtyAdded() != null ? item.getRetailQtyAdded() : qty,
                v != null ? v.getId()          : null,
                v != null ? v.getVariantCode() : p != null ? p.getCode() : null,
                v != null ? v.getVariantName() : p != null ? p.getName() : null,
                v != null ? v.getSellUnit()    : "cai",
                v != null && v.getSellPrice() != null ? v.getSellPrice() : null
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
            log.warn("Ignoring invalid optional invoice snapshot JSON on list/detail mapping", e);
            return null;
        }
    }

    private static <T> List<T> readJsonList(String value, TypeReference<List<T>> typeReference) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return OBJECT_MAPPER.readValue(value, typeReference);
        } catch (Exception e) {
            log.warn("Ignoring invalid optional invoice snapshot list JSON on list/detail mapping", e);
            return List.of();
        }
    }
}
