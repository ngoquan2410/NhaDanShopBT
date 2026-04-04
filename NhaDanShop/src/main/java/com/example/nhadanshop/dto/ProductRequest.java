package com.example.nhadanshop.dto;

import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/**
 * Request tạo/cập nhật sản phẩm.
 *
 * Quy tắc đơn vị:
 *   - importUnit = "bịch" hoặc "hộp" → đơn vị CUỐI CÙNG, không thể chia nhỏ.
 *     piecesPerImportUnit sẽ bị BỎ QUA, luôn tính là 1.
 *   - importUnit = "kg", "xâu"... → đơn vị GỘP, cần nhân piecesPerImportUnit.
 *     VD: 1 kg = 10 bịch → piecesPerImportUnit = 10
 *
 * Ví dụ đúng:
 *   BT Rong bien (nhập bịch): importUnit="bich", piecesPerImportUnit=1
 *   BT Rong bien (nhập kg):   importUnit="kg",   piecesPerImportUnit=10
 *   BT Cuon TC (nhập hộp):    importUnit="hop",  piecesPerImportUnit=1  ← hộp là atomic
 */
public record ProductRequest(
        /** Mã sản phẩm — BẮT BUỘC nhập, không được để trống. Hệ thống không tự generate. */
        @NotBlank(message = "Mã sản phẩm không được để trống") @Size(max = 50) String code,
        @NotBlank @Size(max = 150) String name,
        @NotNull Long categoryId,
        @NotBlank @Size(max = 20) String unit,
        @NotNull @DecimalMin("0.00") BigDecimal costPrice,
        @NotNull @DecimalMin("0.00") BigDecimal sellPrice,
        @NotNull @Min(0) Integer stockQty,
        Boolean active,
        @Min(0) Integer expiryDays,

        /**
         * Đơn vị nhập kho.
         * Atomic (không chia): bịch, hộp, gói, chai, cái, lon, túi
         * Gộp (chia ra bịch):  kg, xâu, 5 xâu, thùng...
         */
        @Size(max = 20) String importUnit,

        /** Đơn vị bán lẻ cuối cùng: bịch, gói, chai... */
        @Size(max = 20) String sellUnit,

        /**
         * Số đơn vị bán lẻ từ 1 đơn vị nhập.
         * Chỉ có ý nghĩa khi importUnit là gộp (kg, xâu...).
         * Bị bỏ qua khi importUnit là atomic (bịch, hộp...).
         */
        @Min(1) Integer piecesPerImportUnit,

        /** Ghi chú quy đổi. VD: "1 xâu = 7 bịch", "1 kg = 10 gói ~100g" */
        @Size(max = 100) String conversionNote,

        /** URL hình ảnh sản phẩm */
        @Size(max = 500) String imageUrl
) {}