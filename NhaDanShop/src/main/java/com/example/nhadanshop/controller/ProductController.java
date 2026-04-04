package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.service.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;
    private final ExcelImportService excelImportService;
    private final ExpiryWarningService expiryWarningService;
    private final CategoryRepository categoryRepository;
    private final ExcelTemplateService excelTemplateService;
    private final ProductVariantService variantService; // Sprint 0

    @GetMapping
    public List<ProductResponse> all() {
        return productService.findAll();
    }

    /**
     * POST /api/products/check-availability
     * Kiểm tra tồn kho khả dụng (stockQty - pending reserved) trước khi checkout.
     * Authenticated user gọi được — không cần ADMIN.
     */
    @PostMapping("/check-availability")
    public StockCheckResponse checkAvailability(@Valid @RequestBody StockCheckRequest req) {
        return productService.checkStock(req);
    }

    /**
     * GET /api/products/next-code?categoryId=1
     * Trả về mã sản phẩm tiếp theo sẽ được tạo cho category đó.
     * Admin dùng để preview trước khi thêm sản phẩm.
     */
    @GetMapping("/next-code")
    public java.util.Map<String, String> nextCode(@RequestParam Long categoryId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + categoryId));
        String code = productService.generateProductCode(category);
        return java.util.Map.of("code", code);
    }

    @GetMapping("/category/{categoryId}")
    public Page<ProductResponse> byCategory(
            @PathVariable Long categoryId,
            @PageableDefault(size = 20, sort = "name") Pageable pageable) {
        return productService.findByCategory(categoryId, pageable);
    }

    @GetMapping("/{id}")
    public ProductResponse one(@PathVariable Long id) {
        return productService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductResponse create(@Valid @RequestBody ProductRequest req) {
        return productService.create(req);
    }

    /**
     * POST /api/products/batch
     * Tạo hàng loạt sản phẩm trong 1 request (thay cho 57 request riêng lẻ).
     * - Code trùng → skip, không báo lỗi.
     * - Trả về: totalCreated, totalSkipped, totalErrors + chi tiết từng mục.
     */
    @PostMapping("/batch")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductService.BatchCreateResult createBatch(
            @Valid @RequestBody List<ProductRequest> requests) {
        return productService.createBatch(requests);
    }

    @PutMapping("/{id}")
    public ProductResponse update(@PathVariable Long id, @Valid @RequestBody ProductRequest req) {
        return productService.update(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        productService.softDelete(id);
    }

    // ── Import Excel ──────────────────────────────────────────────────────────

    /**
     * GET /api/products/template
     * Download file Excel template để import sản phẩm (có dummy data + hướng dẫn).
     */
    @GetMapping("/template")
    public ResponseEntity<byte[]> downloadTemplate() throws IOException {
        byte[] bytes = excelTemplateService.buildProductTemplate();
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename("template_import_san_pham.xlsx").build());
        headers.setContentLength(bytes.length);
        return ResponseEntity.ok().headers(headers).body(bytes);
    }

    /**
     * POST /api/products/import-excel
     * Upload file .xlsx để import hàng loạt sản phẩm.
     */
    @PostMapping(value = "/import-excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ExcelImportResult importFromExcel(@RequestParam("file") MultipartFile file) throws IOException {
        return excelImportService.importProducts(file);
    }

    // ── Expiry Warning ────────────────────────────────────────────────────────

    /**
     * GET /api/products/expiry-warnings
     * Lấy danh sách sản phẩm sắp hết hạn (còn <= 3 ngày) hoặc đã hết hạn.
     * Công thức: daysRemaining = expiryDays - (currentDate - createdAt).days
     */
    @GetMapping("/expiry-warnings")
    public List<ExpiryWarningResponse> expiryWarnings(
            @RequestParam(defaultValue = "3") int threshold) {
        return expiryWarningService.getExpiryWarnings(threshold);
    }

    /**
     * GET /api/products/expired
     * Lấy danh sách sản phẩm đã hết hạn hoàn toàn.
     */
    @GetMapping("/expired")
    public List<ExpiryWarningResponse> expiredProducts() {
        return expiryWarningService.getExpiredProducts();
    }

    // ── Variant endpoints (Sprint 0) ──────────────────────────────────────────

    @GetMapping("/{id}/variants")
    public List<ProductVariantResponse> getVariants(@PathVariable Long id) {
        return variantService.getVariantsByProduct(id);
    }

    @PostMapping("/{id}/variants")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductVariantResponse createVariant(@PathVariable Long id,
                                                @Valid @RequestBody ProductVariantRequest req) {
        return variantService.createVariant(id, req);
    }

    @PutMapping("/{id}/variants/{vid}")
    public ProductVariantResponse updateVariant(@PathVariable Long id, @PathVariable Long vid,
                                                @Valid @RequestBody ProductVariantRequest req) {
        return variantService.updateVariant(vid, req);
    }

    @DeleteMapping("/{id}/variants/{vid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteVariant(@PathVariable Long id, @PathVariable Long vid) {
        variantService.deleteVariant(vid);
    }

    @GetMapping("/low-stock-variants")
    public List<ProductVariantResponse> getLowStockVariants() {
        return variantService.getLowStockVariants();
    }
}

