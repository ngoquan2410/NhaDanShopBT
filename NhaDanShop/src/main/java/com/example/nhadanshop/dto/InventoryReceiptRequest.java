package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.List;

public record InventoryReceiptRequest(
        @Size(max = 150) String supplierName,
        /** FK → suppliers.id (Sprint 1 S1-3). Null → chỉ lưu supplierName snapshot */
        Long supplierId,
        @Size(max = 500) String note,
        /** Phí vận chuyển toàn đơn — phân bổ theo tỷ lệ giá trị sau CK */
        @DecimalMin("0.00") BigDecimal shippingFee,
        /**
         * Thuế GTGT (VAT) % cho TOÀN ĐƠN (0-100).
         * Tính trên tổng sau chiết khấu: vatAmount = totalAfterDiscount × vatPercent/100
         * Sau đó phân bổ đều vào giá vốn từng sản phẩm theo tỷ lệ.
         * Để trống / null = 0% (không có VAT).
         */
        @DecimalMin("0.00") BigDecimal vatPercent,
        /** Các dòng sản phẩm đơn lẻ */
        @Valid List<ReceiptItemRequest> items,
        /** Các dòng nhập theo combo (optional) */
        @Valid List<ComboReceiptRequest> comboItems
) {
    /**
     * Nhập 1 dòng theo combo:
     *  comboId         = ID combo (Product.productType=COMBO)
     *  quantity        = số lượng combo nhập
     *  unitCost        = giá nhập 1 combo (chia đều cho thành phần theo qty ratio)
     *  discountPercent = chiết khấu % áp dụng cho combo này
     */
    public record ComboReceiptRequest(
            @NotNull Long comboId,
            @NotNull @Min(1) Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitCost,
            @DecimalMin("0.00") BigDecimal discountPercent
    ) {}
}
