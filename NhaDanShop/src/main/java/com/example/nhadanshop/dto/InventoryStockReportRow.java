package com.example.nhadanshop.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Một dòng báo cáo tồn kho cho 1 variant trong kỳ.
 *
 * Công thức (logic trong {@link com.example.nhadanshop.service.InventoryStockService}):
 *   prodNet = tổng signed qty_delta của movement sản xuất (Slice 6) trong kỳ hoặc sau {@code from}
 *   closingStock = openingStock + totalReceived - totalSold + prodNet kỳ + totalAdjusted
 *
 *   openingStock  = tính ngược từ stock hiện tại, nhập sau from, bán sau from, và prodNet sau from
 *   totalReceived = tổng nhập kho (phiếu nhập) trong kỳ
 *   totalSold     = tổng bán (invoice) trong kỳ
 *
 *   [Sprint 0] Thêm variantId/variantCode/variantName để báo cáo theo variant.
 *   Backward compat: variantId = null → dòng báo cáo theo product (legacy).
 */
public record InventoryStockReportRow(
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        /** Nullable — lọc server-side theo categoryId */
        Long categoryId,
        String sellUnit,
        /** [Sprint 0] Variant ID — null nếu SP chưa có variant */
        Long variantId,
        /** [Sprint 0] Mã variant — fallback product.code nếu null */
        String variantCode,
        /** [Sprint 0] Tên variant — fallback product.name nếu null */
        String variantName,
        /** Tồn đầu kỳ (đơn vị bán lẻ) */
        int openingStock,
        /** Tổng nhập kỳ (đơn vị bán lẻ) */
        int totalReceived,
        /** Tổng xuất (bán) kỳ (đơn vị bán lẻ) */
        int totalSold,
        /** Tổng điều chỉnh đã xác nhận trong kỳ (diffQty, signed) */
        int totalAdjusted,
        /** Tồn cuối kỳ = openingStock + totalReceived - totalSold */
        int closingStock,
        /** Giá vốn tồn kho cuối kỳ */
        @JsonProperty("closingValue")
        BigDecimal closingStockValue,
        /** [Sprint 0 - P0-4] Ngưỡng tồn tối thiểu của variant — cảnh báo khi closingStock <= này */
        Integer minStockQty,
        LocalDate fromDate,
        LocalDate toDate
) {}
