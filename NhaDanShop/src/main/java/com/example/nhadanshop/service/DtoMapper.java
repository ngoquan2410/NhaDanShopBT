package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

/** Utility class chuyển đổi Entity → Response DTO */
public final class DtoMapper {

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
        BigDecimal grossProfit = inv.getItems().stream()
                .map(i -> i.getUnitPrice()
                        .subtract(i.getUnitCostSnapshot())
                        .multiply(BigDecimal.valueOf(i.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal totalProfit = grossProfit.subtract(discountAmount);

        return new SalesInvoiceResponse(
                inv.getId(), inv.getInvoiceNo(), inv.getInvoiceDate(),
                inv.getCustomerName(), inv.getNote(),
                inv.getTotalAmount(), discountAmount, finalAmount,
                inv.getPromotionName(), totalProfit,
                inv.getCreatedBy() != null ? inv.getCreatedBy().getUsername() : null,
                inv.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
                inv.getCreatedAt(), inv.getUpdatedAt()
        );
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
                item.getComboUnitPrice()
        );
    }

    // ── InventoryReceipt ──────────────────────────────────────────────────────
    public static InventoryReceiptResponse toResponse(InventoryReceipt r) {
        return new InventoryReceiptResponse(
                r.getId(), r.getReceiptNo(), r.getReceiptDate(),
                r.getSupplierName(),
                r.getSupplier() != null ? r.getSupplier().getId() : null, // supplierId Sprint 1
                r.getNote(), r.getTotalAmount(),
                r.getShippingFee()  != null ? r.getShippingFee()  : BigDecimal.ZERO,
                r.getTotalVat()     != null ? r.getTotalVat()     : BigDecimal.ZERO,
                r.getCreatedBy() != null ? r.getCreatedBy().getUsername() : null,
                r.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
                r.getCreatedAt(), r.getUpdatedAt()
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
}
