package com.example.nhadanshop.service;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.LocalDate;
import java.util.concurrent.CompletableFuture;

@Service
@RequiredArgsConstructor
public class AsyncReportJobService {

    private final InventoryStockService inventoryStockService;
    private final RevenueService revenueService;
    private final ReportService reportService;

    @Async
    public CompletableFuture<byte[]> exportInventoryReport(LocalDate from, LocalDate to) throws IOException {
        return CompletableFuture.completedFuture(inventoryStockService.exportStockReportToExcel(from, to));
    }

    @Async
    public CompletableFuture<byte[]> exportRevenueTotal(LocalDate from, LocalDate to, String period) throws IOException {
        return CompletableFuture.completedFuture(revenueService.exportTotalRevenueExcel(from, to, period));
    }

    @Async
    public CompletableFuture<byte[]> exportProfitReport(LocalDate from, LocalDate to) throws IOException {
        return CompletableFuture.completedFuture(reportService.exportProfitToExcel(from, to));
    }
}
