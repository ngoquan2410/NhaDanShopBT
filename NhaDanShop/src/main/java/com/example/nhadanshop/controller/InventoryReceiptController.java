package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.ExcelPreviewResponse;
import com.example.nhadanshop.dto.InventoryReceiptRequest;
import com.example.nhadanshop.dto.InventoryReceiptResponse;
import com.example.nhadanshop.dto.ReceiptMetaUpdateRequest;
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
import java.time.LocalDateTime;
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
     * PATCH /api/receipts/{id}/meta
     * Chỉ cho sửa metadata: ghi chú, nhà cung cấp.
     * Không ảnh hưởng tồn kho hay giá vốn.
     */
    @PatchMapping("/{id}/meta")
    public InventoryReceiptResponse updateMeta(
            @PathVariable Long id,
            @Valid @RequestBody ReceiptMetaUpdateRequest req) {
        return receiptService.updateReceiptMeta(id, req);
    }

    /** DELETE /api/receipts/{id} */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        receiptService.deleteReceipt(id);
    }

    /**
     * POST /api/receipts/preview-excel
     * Parse file Excel, trả về danh sách rows kèm lỗi — KHÔNG ghi DB.
     * FE dùng để hiển thị preview trước khi admin xác nhận.
     */
    @PostMapping(value = "/preview-excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ExcelPreviewResponse previewExcel(
            @RequestParam("file") MultipartFile file) throws IOException {
        return excelReceiptImportService.previewExcel(file);
    }

    /**
     * POST /api/receipts/import-excel
     * Nhập phiếu nhập kho từ file Excel (.xlsx).
     *
     * Form-data params:
     *   file         : file .xlsx (required)
     *   supplierName : tên nhà cung cấp (optional — nếu có supplierId thì ưu tiên supplierId)
     *   supplierId   : ID nhà cung cấp (optional, Long)
     *   note         : ghi chú phiếu nhập (optional)
     *   shippingFee  : phí vận chuyển (optional, default=0)
     *   vatPercent   : thuế GTGT % (optional, default=0)
     *
     * Cấu trúc Excel — Sheet "SP Don" (14 cột A-N, header row 3, data từ row 4):
     *   A: Mã SP (*)       B: Mã Variant (optional)   C: Tên SP
     *   D: Số lượng (*)    E: Giá nhập (*)            F: Giá bán
     *   G: Chiết khấu %    H: Ghi chú dòng
     *   I: Danh mục (SP mới)  J: Đơn vị (SP mới)
     *   K: ĐV Nhập kho     L: ĐV Bán lẻ              M: Số lẻ/ĐV nhập
     *   N: Ngày HSD thực tế (yyyy-MM-dd / dd/MM/yyyy — ghi đè expiryDays, optional)
     */
    @PostMapping(value = "/import-excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ExcelReceiptImportService.ExcelReceiptResult importFromExcel(
            @RequestParam("file") MultipartFile file,
            @RequestParam("supplierName") String supplierName,
            @RequestParam(value = "supplierId",   required = false) Long supplierId,
            @RequestParam(value = "note",         required = false, defaultValue = "") String note,
            @RequestParam(value = "shippingFee",  required = false, defaultValue = "0") java.math.BigDecimal shippingFee,
            @RequestParam(value = "vatPercent",   required = false, defaultValue = "0") java.math.BigDecimal vatPercent,
            @RequestParam(value = "receiptDate",  required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDateTime receiptDateTime
    ) throws IOException {
        // Chuyển LocalDate → LocalDateTime (đầu ngày), null → service tự dùng now()
        //LocalDateTime receiptDateTime = (receiptDate != null) ? receiptDate.atStartOfDay() : null;
        return excelReceiptImportService.importReceiptFromExcel(
                file, supplierName, supplierId, note, shippingFee, vatPercent, receiptDateTime != null ? receiptDateTime: null);
    }
}
