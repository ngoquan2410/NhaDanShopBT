package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.InventoryReceiptRequest;
import com.example.nhadanshop.dto.InventoryReceiptResponse;
import com.example.nhadanshop.service.ExcelReceiptImportService;
import com.example.nhadanshop.service.ExcelTemplateService;
import com.example.nhadanshop.service.InventoryReceiptService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDate;
import java.time.LocalTime;

@RestController
@RequestMapping("/api/receipts")
@RequiredArgsConstructor
public class InventoryReceiptController {

    private final InventoryReceiptService receiptService;
    private final ExcelReceiptImportService excelReceiptImportService;
    private final ExcelTemplateService excelTemplateService;

    /** GET /api/receipts/template — Download Excel template import phiếu nhập kho */
    @GetMapping("/template")
    public ResponseEntity<byte[]> downloadTemplate() throws IOException {
        byte[] bytes = excelTemplateService.buildReceiptTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename("template_import_phieu_nhap_kho.xlsx").build());
        headers.setContentLength(bytes.length);
        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    /** GET /api/receipts?from=&to=&page=&size= */
    @GetMapping
    public Page<InventoryReceiptResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 20) Pageable pageable) {
        if (from != null && to != null) {
            return receiptService.listReceiptsByDateRange(
                    from.atStartOfDay(), to.atTime(LocalTime.MAX), pageable);
        }
        return receiptService.listReceipts(pageable);
    }

    /** GET /api/receipts/{id} */
    @GetMapping("/{id}")
    public InventoryReceiptResponse one(@PathVariable Long id) {
        return receiptService.getReceipt(id);
    }

    /** POST /api/receipts - Tạo phiếu nhập từ JSON */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public InventoryReceiptResponse create(@Valid @RequestBody InventoryReceiptRequest req) {
        return receiptService.createReceipt(req);
    }

    /**
     * POST /api/receipts/import-excel
     * Nhập phiếu nhập kho từ file Excel (.xlsx).
     *
     * Form-data params:
     *   file         : file .xlsx (required)
     *   supplierName : tên nhà cung cấp (required)
     *   note         : ghi chú phiếu nhập (optional)
     *
     * Cấu trúc Excel (row 1 = header, từ row 2 = data):
     *   A: code (mã SP)  B: name (tên SP – fallback nếu không có code)
     *   C: quantity (số lượng đơn vị NHẬP)
     *   D: unitCost (giá / 1 đơn vị NHẬP: kg/xâu/hộp/bịch/chai)
     *   E: note (ghi chú dòng, optional)
     *
     * Quy tắc tính tự động:
     *   - ATOMIC (bich/hop/chai): retailQty = quantity, costPerUnit = unitCost
     *   - GOP    (kg/xau)       : retailQty = quantity × pieces, costPerUnit = unitCost / pieces
     *   - Batch expiryDate = ngayNhap + product.expiryDays
     */
    @PostMapping(value = "/import-excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ExcelReceiptImportService.ExcelReceiptResult importFromExcel(
            @RequestParam("file") MultipartFile file,
            @RequestParam("supplierName") String supplierName,
            @RequestParam(value = "note", required = false, defaultValue = "") String note,
            @RequestParam(value = "shippingFee", required = false, defaultValue = "0") java.math.BigDecimal shippingFee,
            @RequestParam(value = "vatPercent",  required = false, defaultValue = "0") java.math.BigDecimal vatPercent
    ) throws IOException {
        return excelReceiptImportService.importReceiptFromExcel(file, supplierName, note, shippingFee, vatPercent);
    }
}
