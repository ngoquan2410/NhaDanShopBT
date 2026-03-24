package com.example.nhadanshop.dto;

import java.util.List;

/**
 * Kết quả import Excel
 */
public record ExcelImportResult(
        int totalRows,
        int successCount,
        int skipCount,
        int errorCount,
        List<String> errors
) {}
