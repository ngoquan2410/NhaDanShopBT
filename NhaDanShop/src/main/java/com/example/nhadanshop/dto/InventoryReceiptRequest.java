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
        @Size(max = 500) String note,
        /** Phí vận chuyển toàn đơn */
        @DecimalMin("0.00") BigDecimal shippingFee,
        /** Các dòng sản phẩm đơn lẻ */
        @Valid List<ReceiptItemRequest> items,
        /** Các dòng nhập theo combo (optional) */
        @Valid List<ComboReceiptRequest> comboItems
) {
    /**
     * Nhập 1 dòng theo combo:
     *  comboId      = ID combo
     *  quantity     = số lượng combo nhập (không phải số lượng từng thành phần)
     *  unitCost     = giá nhập 1 combo (sẽ chia đều cho từng thành phần theo qty)
     *  discountPercent = chiết khấu % áp dụng cho cả combo này
     *  vatPercent   = VAT % áp dụng cho cả combo này
     */
    public record ComboReceiptRequest(
            @NotNull Long comboId,
            @NotNull @Min(1) Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitCost,
            @DecimalMin("0.00") BigDecimal discountPercent,
            @DecimalMin("0.00") BigDecimal vatPercent
    ) {}
}
