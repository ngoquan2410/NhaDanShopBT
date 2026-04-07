package com.example.nhadanshop.dto;

import jakarta.validation.constraints.*;
import java.util.List;

/**
 * Request tạo/cập nhật sản phẩm.
 */
public record ProductRequest(
        /** Mã sản phẩm — BẮT BUỘC nhập, không được để trống. Hệ thống không tự generate. */
        @NotBlank(message = "Mã sản phẩm không được để trống") @Size(max = 50) String code,
        @NotBlank @Size(max = 150) String name,
        @NotNull Long categoryId,
        Boolean active,

        /** URL hình ảnh sản phẩm */
        @Size(max = 500) String imageUrl,

        /**
         * Loại sản phẩm: "SINGLE" (mặc định) hoặc "COMBO".
         * Nullable → mặc định SINGLE.
         */
        String productType,

        /**
         * Danh sách variants khởi tạo — chỉ dùng khi tạo mới SINGLE product.
         * Nếu null/empty → tự tạo 1 default variant rỗng (backward compat).
         * Nếu có data → tạo các variant này, cái có isDefault=true sẽ là default.
         */
        List<ProductVariantRequest> initialVariants
) {}