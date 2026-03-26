package com.example.nhadanshop.dto;

import java.math.BigDecimal;
import java.util.List;

/**
 * Response thống kê doanh thu theo sản phẩm.
 * productId / productCode / productName: định danh sản phẩm
 * categoryName: danh mục
 * unit: đơn vị
 * rows: các kỳ (ngày/tuần/tháng/năm) với doanh thu
 * totalAmount: tổng doanh thu tất cả kỳ
 * totalQty: tổng số lượng bán
 */
public record RevenueByProductDto(
        Long productId,
        String productCode,
        String productName,
        String categoryName,
        String unit,
        List<RevenueRowDto> rows,
        BigDecimal totalAmount,
        Long totalQty
) {}
