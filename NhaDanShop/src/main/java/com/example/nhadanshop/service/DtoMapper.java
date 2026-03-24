package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;

import java.math.BigDecimal;
import java.util.stream.Collectors;

/** Utility class chuyển đổi Entity → Response DTO */
public final class DtoMapper {

    private DtoMapper() {}

    public static CategoryResponse toResponse(Category c) {
        return new CategoryResponse(
                c.getId(), c.getName(), c.getDescription(), c.getActive(),
                c.getCreatedAt(), c.getUpdatedAt()
        );
    }

    public static ProductResponse toResponse(Product p) {
        return toResponse(p, p.getStockQty()); // availableQty = stockQty nếu không biết pending
    }

    public static ProductResponse toResponse(Product p, int availableQty) {
        return new ProductResponse(
                p.getId(), p.getCode(), p.getName(), p.getUnit(),
                p.getCostPrice(), p.getSellPrice(), p.getStockQty(), availableQty, p.getActive(),
                p.getCategory().getId(), p.getCategory().getName(),
                p.getExpiryDays(),
                p.getImportUnit(), p.getSellUnit(),
                p.getPiecesPerImportUnit(), p.getConversionNote(),
                p.getImageUrl(),
                p.getCreatedAt(), p.getUpdatedAt()
        );
    }

    public static SalesInvoiceItemResponse toResponse(SalesInvoiceItem item) {
        BigDecimal lineTotal = item.getUnitPrice()
                .multiply(BigDecimal.valueOf(item.getQuantity()));
        BigDecimal profit = item.getUnitPrice()
                .subtract(item.getUnitCostSnapshot())
                .multiply(BigDecimal.valueOf(item.getQuantity()));
        return new SalesInvoiceItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProduct().getCode(),
                item.getProduct().getName(),
                item.getProduct().getUnit(),
                item.getQuantity(),
                item.getUnitPrice(),
                item.getUnitCostSnapshot(),
                lineTotal,
                profit
        );
    }

    public static SalesInvoiceResponse toResponse(SalesInvoice inv) {
        BigDecimal totalProfit = inv.getItems().stream()
                .map(i -> i.getUnitPrice()
                        .subtract(i.getUnitCostSnapshot())
                        .multiply(BigDecimal.valueOf(i.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new SalesInvoiceResponse(
                inv.getId(), inv.getInvoiceNo(), inv.getInvoiceDate(),
                inv.getCustomerName(), inv.getNote(), inv.getTotalAmount(), totalProfit,
                inv.getCreatedBy() != null ? inv.getCreatedBy().getUsername() : null,
                inv.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
                inv.getCreatedAt(), inv.getUpdatedAt()
        );
    }

    public static InventoryReceiptItemResponse toResponse(InventoryReceiptItem item) {
        BigDecimal lineTotal = item.getUnitCost()
                .multiply(BigDecimal.valueOf(item.getQuantity()));
        return new InventoryReceiptItemResponse(
                item.getId(),
                item.getProduct().getId(),
                item.getProduct().getCode(),
                item.getProduct().getName(),
                item.getProduct().getUnit(),
                item.getQuantity(),
                item.getUnitCost(),
                lineTotal
        );
    }

    public static InventoryReceiptResponse toResponse(InventoryReceipt r) {
        return new InventoryReceiptResponse(
                r.getId(), r.getReceiptNo(), r.getReceiptDate(),
                r.getSupplierName(), r.getNote(), r.getTotalAmount(),
                r.getCreatedBy() != null ? r.getCreatedBy().getUsername() : null,
                r.getItems().stream().map(DtoMapper::toResponse).collect(Collectors.toList()),
                r.getCreatedAt(), r.getUpdatedAt()
        );
    }

    public static UserResponse toResponse(User u) {
        return new UserResponse(
                u.getId(), u.getUsername(), u.getFullName(), u.getActive(),
                u.getRoles().stream().map(Role::getName).collect(Collectors.toSet()),
                u.getCreatedAt(), u.getUpdatedAt()
        );
    }
}
