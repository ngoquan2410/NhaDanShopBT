package com.example.nhadanshop.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record InventoryReceiptRequest(
        @Size(max = 150) String supplierName,
        Long supplierId,
        @Size(max = 500) String note,
        @DecimalMin("0.00") BigDecimal shippingFee,
        @DecimalMin("0.00") BigDecimal vatPercent,
        @Valid List<ReceiptItemRequest> items,
        @Valid List<ComboReceiptRequest> comboItems,
        /**
         * Ngày nhập kho thực tế — optional.
         * null → dùng LocalDateTime.now() (hôm nay).
         * Không được là ngày tương lai (validate tại service).
         * Dùng khi hàng về trước nhưng hôm nay mới vào máy.
         */
        LocalDateTime receiptDate
) {
    public record ComboReceiptRequest(
            @NotNull Long comboId,
            @NotNull @Min(1) Integer quantity,
            @NotNull @DecimalMin("0.00") BigDecimal unitCost,
            @DecimalMin("0.00") BigDecimal discountPercent
    ) {}
}
