package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ExpiryWarningResponse;
import com.example.nhadanshop.entity.ProductBatch;
import com.example.nhadanshop.repository.ProductBatchRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * Service cảnh báo sản phẩm sắp hết hạn sử dụng.
 *
 * Công thức ĐÚNG (theo lô hàng - ProductBatch):
 *   expiryDate = ngày nhập lô + product.expiryDays  (set khi tạo Batch trong InventoryReceiptService)
 *   daysRemaining = expiryDate - today
 *
 * KHÔNG dùng product.createdAt vì:
 *   - product.createdAt = ngày tạo danh mục sản phẩm trong hệ thống (không thay đổi)
 *   - expiryDate của lô = ngày nhập thực tế + hạn sử dụng (thay đổi mỗi lần nhập)
 *
 * Cảnh báo khi: daysRemaining <= threshold
 * Hết hạn khi:  daysRemaining <= 0 và lô còn hàng (nguy hiểm - cần xử lý)
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ExpiryWarningService {

    private static final int DEFAULT_WARNING_THRESHOLD = 30; // cảnh báo trước 30 ngày

    private final ProductBatchRepository batchRepository;

    /**
     * Lấy danh sách LÔ HÀNG sắp hết hạn (còn <= threshold ngày) và còn hàng tồn.
     * Mặc định 30 ngày.
     */
    public List<ExpiryWarningResponse> getExpiryWarnings() {
        return getExpiryWarnings(DEFAULT_WARNING_THRESHOLD);
    }

    /**
     * Lấy danh sách LÔ HÀNG sắp hết hạn với threshold tùy chỉnh.
     *
     * @param thresholdDays số ngày ngưỡng cảnh báo (VD: 3, 7, 30)
     */
    public List<ExpiryWarningResponse> getExpiryWarnings(int thresholdDays) {
        LocalDate today = LocalDate.now();
        LocalDate threshold = today.plusDays(thresholdDays);

        // Lấy các lô còn hàng, hết hạn trước threshold
        return batchRepository.findExpiringBatches(threshold)
                .stream()
                .map(b -> toWarningResponse(b, today))
                .sorted((a, b) -> Long.compare(a.daysRemaining(), b.daysRemaining()))
                .toList();
    }

    /**
     * Lấy danh sách LÔ HÀNG đã HẾT HẠN mà vẫn còn tồn kho.
     * → Cần xử lý / tiêu hủy ngay.
     */
    public List<ExpiryWarningResponse> getExpiredProducts() {
        LocalDate today = LocalDate.now();

        return batchRepository.findExpiredWithStock(today)
                .stream()
                .map(b -> toWarningResponse(b, today))
                .sorted((a, b) -> Long.compare(a.daysRemaining(), b.daysRemaining()))
                .toList();
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private ExpiryWarningResponse toWarningResponse(ProductBatch batch, LocalDate today) {
        // daysRemaining = expiryDate - today (âm = đã hết hạn)
        long daysRemaining = ChronoUnit.DAYS.between(today, batch.getExpiryDate());

        String sellUnit = batch.getProduct().getSellUnit() != null
                ? batch.getProduct().getSellUnit()
                : batch.getProduct().getUnit();

        String category = batch.getProduct().getCategory() != null
                ? batch.getProduct().getCategory().getName() : "";

        return new ExpiryWarningResponse(
                batch.getId(),
                batch.getBatchCode(),
                batch.getProduct().getId(),
                batch.getProduct().getCode(),
                batch.getProduct().getName(),
                category,
                sellUnit,
                batch.getRemainingQty(),
                batch.getExpiryDate(),
                daysRemaining,
                buildWarningMessage(daysRemaining)
        );
    }

    private String buildWarningMessage(long daysRemaining) {
        if (daysRemaining < 0) {
            return "⛔ Đã hết hạn " + Math.abs(daysRemaining) + " ngày trước! Cần xử lý ngay!";
        } else if (daysRemaining == 0) {
            return "⛔ Hết hạn HÔM NAY! Không được bán!";
        } else if (daysRemaining <= 3) {
            return "🔴 Còn " + daysRemaining + " ngày - Ưu tiên bán trước!";
        } else if (daysRemaining <= 7) {
            return "🟠 Còn " + daysRemaining + " ngày - Sắp hết hạn!";
        } else if (daysRemaining <= 14) {
            return "🟡 Còn " + daysRemaining + " ngày - Theo dõi";
        } else {
            return "🟢 Còn " + daysRemaining + " ngày";
        }
    }
}
