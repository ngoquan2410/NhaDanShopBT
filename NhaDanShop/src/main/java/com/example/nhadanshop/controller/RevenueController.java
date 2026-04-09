package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.service.RevenueService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * API thống kê doanh thu.
 *
 * period = "daily" | "weekly" | "monthly" | "yearly"
 *
 * ── Tổng doanh thu ────────────────────────────────────────────────────────
 * GET /api/revenue/total?from=2026-01-01&to=2026-03-31&period=daily
 * GET /api/revenue/total/export?from=...&to=...&period=...
 *
 * ── Theo sản phẩm ─────────────────────────────────────────────────────────
 * GET /api/revenue/by-product?from=...&to=...&period=...
 * GET /api/revenue/by-product/export?from=...&to=...&period=...
 *
 * ── Theo danh mục ─────────────────────────────────────────────────────────
 * GET /api/revenue/by-category?from=...&to=...&period=...
 * GET /api/revenue/by-category/export?from=...&to=...&period=...
 */
@RestController
@RequestMapping("/api/revenue")
@RequiredArgsConstructor
public class RevenueController {

    private final RevenueService revenueService;
    private static final DateTimeFormatter FILE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");

    // ════════════════════════════════════════════════════════════════
    // TỔNG DOANH THU
    // ════════════════════════════════════════════════════════════════

    @GetMapping("/total")
    public RevenueTotalDto totalRevenue(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "daily") String period) {
        return revenueService.getTotalRevenue(from, to, period);
    }

    @GetMapping("/total/export")
    public ResponseEntity<byte[]> exportTotal(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "daily") String period) throws IOException {
        byte[] bytes = revenueService.exportTotalRevenueExcel(from, to, period);
        return excelResponse(bytes, "SoDoanhthu_" + from.format(FILE_FMT) + "_" + to.format(FILE_FMT));
    }

    // ════════════════════════════════════════════════════════════════
    // DOANH THU THEO SẢN PHẨM
    // ════════════════════════════════════════════════════════════════

    @GetMapping("/by-product")
    public List<RevenueByProductDto> revenueByProduct(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "daily") String period) {
        return revenueService.getRevenueByProduct(from, to, period);
    }

    @GetMapping("/by-product/export")
    public ResponseEntity<byte[]> exportByProduct(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "daily") String period) throws IOException {
        byte[] bytes = revenueService.exportRevenueByProductExcel(from, to, period);
        return excelResponse(bytes, "DoanhThu_SanPham_" + from.format(FILE_FMT) + "_" + to.format(FILE_FMT));
    }

    // ════════════════════════════════════════════════════════════════
    // DOANH THU THEO DANH MỤC
    // ════════════════════════════════════════════════════════════════

    @GetMapping("/by-category")
    public List<RevenueByCategoryDto> revenueByCategory(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "daily") String period) {
        return revenueService.getRevenueByCategory(from, to, period);
    }

    @GetMapping("/by-category/export")
    public ResponseEntity<byte[]> exportByCategory(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "daily") String period) throws IOException {
        byte[] bytes = revenueService.exportRevenueByCategoryExcel(from, to, period);
        return excelResponse(bytes, "DoanhThu_DanhMuc_" + from.format(FILE_FMT) + "_" + to.format(FILE_FMT));
    }

    // ════════════════════════════════════════════════════════════════
    // HELPER
    // ════════════════════════════════════════════════════════════════

    private ResponseEntity<byte[]> excelResponse(byte[] bytes, String filename) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDisposition(
                ContentDisposition.attachment().filename(filename + ".xlsx").build());
        headers.setContentLength(bytes.length);
        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    // ════════════════════════════════════════════════════════════════
    // SPRINT 2 — TOP PRODUCTS / SLOW PRODUCTS
    // ════════════════════════════════════════════════════════════════

    /**
     * GET /api/revenue/top-products?from=2026-01-01&to=2026-04-08&limit=10
     * Trả về Top N variant bán chạy nhất theo số lượng trong kỳ.
     */
    @GetMapping("/top-products")
    public List<TopProductDto> topProducts(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "10") int limit) {
        return revenueService.getTopProducts(from, to, Math.min(limit, 100));
    }

    /**
     * GET /api/revenue/slow-products?days=30
     * Trả về danh sách variant không có GD trong N ngày gần nhất (còn tồn kho).
     */
    @GetMapping("/slow-products")
    public List<SlowProductDto> slowProducts(
            @RequestParam(defaultValue = "30") int days) {
        return revenueService.getSlowProducts(Math.max(1, days));
    }
}
