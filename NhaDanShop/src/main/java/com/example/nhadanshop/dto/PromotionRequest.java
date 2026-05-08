package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record PromotionRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 1000) String description,

        /** PERCENT_DISCOUNT | FIXED_DISCOUNT | BUY_X_GET_Y | FREE_SHIPPING */
        @NotBlank String type,

        @DecimalMin("0.00") BigDecimal discountValue,
        @DecimalMin("0.00") BigDecimal minOrderValue,
        BigDecimal maxDiscount,

        @NotNull LocalDateTime startDate,
        @NotNull LocalDateTime endDate,

        /** ALL | CATEGORY | PRODUCT */
        String appliesTo,
        /** ELIGIBLE_ITEMS | WHOLE_ORDER */
        String minOrderScope,

        /** IDs của danh mục áp dụng (khi appliesTo=CATEGORY) */
        List<Long> categoryIds,

        /** IDs của sản phẩm áp dụng (khi appliesTo=PRODUCT) */
        List<Long> productIds,

        Boolean active,

        // ── BUY_X_GET_Y ────────────────────────────────────────────────────
        /** Số lượng cần mua (X) — dùng khi type=BUY_X_GET_Y và không có buyItems */
        Integer buyQty,
        /** ID sản phẩm được tặng */
        Long getProductId,
        /** Số lượng sản phẩm được tặng */
        Integer getQty,

        // ── QUANTITY_GIFT ──────────────────────────────────────────────────
        /** Mua tối thiểu N SP → tặng (dùng khi type=QUANTITY_GIFT); null = chỉ kích hoạt theo đơn tối thiểu / mặc định 1 */
        Integer minBuyQty,
        /** Legacy: giới hạn số lần tặng — map DB column max_buy_qty */
        Integer maxBuyQty,

        /** BUY_X_GET_Y: mỗi dòng là một sản phẩm và số lượng cần mua; khi rỗng dùng productIds + buyQty */
        @Valid List<PromotionBuyItemRequest> buyItems,

        /** Lặp lại theo bộ ngưỡng; mặc định true khi null */
        Boolean repeatable,

        /** QUANTITY_GIFT: giới hạn số lần áp dụng quà (map DB max_buy_qty); ưu tiên hơn maxBuyQty khi cả hai gửi */
        Integer maxGiftApplications
) {}
