package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.ProductBatchResponse;
import com.example.nhadanshop.service.ProductBatchService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * API quản lý lô hàng (Batch Tracking).
 *
 * Lô hàng được tạo tự động khi nhập kho (POST /api/receipts).
 * Lô hàng được trừ tự động theo FEFO khi bán (POST /api/invoices).
 *
 * Phân quyền:
 *   - GET (xem)    : ADMIN + USER
 *   - Tất cả còn lại: ADMIN
 */
@RestController
@RequestMapping("/api/batches")
@RequiredArgsConstructor
public class ProductBatchController {

    private final ProductBatchService batchService;

    // ─── Theo sản phẩm ────────────────────────────────────────────────────────

    /**
     * GET /api/batches/product/{productId}
     * Tất cả lô của 1 sản phẩm (còn hàng + hết hàng), sắp theo ngày HH tăng.
     */
    @GetMapping("/product/{productId}")
    public List<ProductBatchResponse> byProduct(@PathVariable Long productId) {
        return batchService.getBatchesByProduct(productId);
    }

    /**
     * GET /api/batches/product/{productId}/active
     * Chỉ lô CÒN HÀNG, sắp theo FEFO (hết hạn sớm nhất lên đầu).
     */
    @GetMapping("/product/{productId}/active")
    public List<ProductBatchResponse> activeByProduct(@PathVariable Long productId) {
        return batchService.getActiveBatchesByProduct(productId);
    }

    // ─── Theo phiếu nhập ──────────────────────────────────────────────────────

    /**
     * GET /api/batches/receipt/{receiptId}
     * Tất cả lô được tạo từ 1 phiếu nhập kho.
     */
    @GetMapping("/receipt/{receiptId}")
    public List<ProductBatchResponse> byReceipt(@PathVariable Long receiptId) {
        return batchService.getBatchesByReceipt(receiptId);
    }

    // ─── Cảnh báo hết hạn ─────────────────────────────────────────────────────

    /**
     * GET /api/batches/expiring?days=30
     * Lô còn hàng, sắp hết hạn trong vòng {days} ngày (mặc định 30).
     * Dùng để cảnh báo nhân viên bán hàng ưu tiên xuất trước.
     */
    @GetMapping("/expiring")
    public List<ProductBatchResponse> expiring(
            @RequestParam(defaultValue = "30") int days) {
        return batchService.getExpiringBatches(days);
    }

    /**
     * GET /api/batches/expired
     * Lô đã HẾT HẠN mà vẫn còn hàng tồn → cần xử lý / tiêu hủy.
     */
    @GetMapping("/expired")
    public List<ProductBatchResponse> expired() {
        return batchService.getExpiredBatchesWithStock();
    }

    // ─── Chi tiết 1 lô ────────────────────────────────────────────────────────

    /**
     * GET /api/batches/{id}
     * Chi tiết 1 lô theo ID.
     */
    @GetMapping("/{id}")
    public ProductBatchResponse one(@PathVariable Long id) {
        return batchService.getBatchById(id);
    }
}
