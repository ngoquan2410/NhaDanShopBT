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
import org.springframework.data.domain.PageImpl;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.*;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
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

    /**
     * Danh sách phân trang + lọc. Mặc định chỉ SP đang active;
     * {@code includeInactive=true} để quản trị thấy cả đã lưu kho.
     */
    @GetMapping
    public Page<?> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false, defaultValue = "false") boolean includeInactive,
            @RequestParam(required = false, defaultValue = "false") boolean forSaleOnly,
            @RequestParam(required = false) String productType,
            @PageableDefault(size = 50, sort = "name") Pageable pageable) {
        if (includeInactive && !isRoleAdmin()) {
            throw new AccessDeniedException("Không có quyền xem sản phẩm không hoạt động");
        }
        if (!hasAdminOrStaffRole()) {
            return productService.searchPublic(search, categoryId, productType, pageable);
        }
        return productService.search(
                search, categoryId, includeInactive, productType, forSaleOnly, pageable);
    }

    private boolean isRoleAdmin() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }
        return auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
    }

    /** Admin/staff catalog search may match variant code/name on any variant row (see repository). */
    private boolean hasAdminOrStaffRole() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            return false;
        }
        return auth.getAuthorities().stream()
                .anyMatch(a -> {
                    String g = a.getAuthority();
                    return "ROLE_ADMIN".equals(g) || "ROLE_STAFF".equals(g);
                });
    }

    /**
     * GET /api/products/next-code?categoryId=1
     */
    @GetMapping("/next-code")
    public java.util.Map<String, String> nextCode(@RequestParam Long categoryId) {
        Category category = categoryRepository.findById(categoryId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + categoryId));
        String code = productService.generateProductCode(category);
        return java.util.Map.of("code", code);
    }

    @GetMapping("/category/{categoryId}")
    public Page<?> byCategory(
            @PathVariable Long categoryId,
            @PageableDefault(size = 20, sort = "name") Pageable pageable) {
        if (!hasAdminOrStaffRole()) {
            return productService.findByCategoryPublic(categoryId, pageable);
        }
        return productService.findByCategory(categoryId, pageable, false);
    }

    /**
     * GET /api/products/variants/availability?variantIds=1,2,3
     * Storefront batch: public-safe aggregate availability (max 100 ids, one sellable-sum query).
     */
    @GetMapping("/variants/availability")
    public List<PublicVariantAvailabilityRow> variantAvailability(@RequestParam(name = "variantIds") String variantIds) {
        return productService.publicVariantAvailabilityBatch(variantIds);
    }

    @GetMapping("/{id}")
    public Object one(@PathVariable Long id) {
        if (!hasAdminOrStaffRole()) {
            return productService.findByIdPublic(id);
        }
        return productService.findById(id, false);
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

    @PatchMapping("/{id}")
    public ProductResponse patch(@PathVariable Long id, @Valid @RequestBody ProductPatchRequest req) {
        return productService.patch(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        productService.deleteOrArchive(id);
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
     * POST /api/products/preview-excel
     * Parse + validate file Excel, trả về danh sách rows kèm lỗi — KHÔNG ghi DB.
     * FE dùng để hiển thị preview trước khi admin xác nhận import.
     */
    @PostMapping(value = "/preview-excel", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ProductExcelPreviewResponse previewFromExcel(
            @RequestParam("file") MultipartFile file) throws IOException {
        return excelImportService.previewProducts(file);
    }

    /**
     * POST /api/products/import-excel
     * Upload file .xlsx để import hàng loạt sản phẩm.
     * Chỉ thực hiện ghi DB khi KHÔNG có lỗi nào (Pass 1 sạch).
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

    /**
     * Danh sách variant của SP. Mặc định trả về tất cả (kể cả đã archive) để quản trị / lịch sử.
     * Truyền {@code activeOnly=true} để chỉ lấy variant đang kinh doanh (chọn bán / lọc an toàn).
     * {@code forSaleOnly=true} → active + isSellable (POS/online).
     */
    @GetMapping("/{id}/variants")
    public List<ProductVariantResponse> getVariants(
            @PathVariable Long id,
            @RequestParam(value = "activeOnly", required = false, defaultValue = "false") boolean activeOnly,
            @RequestParam(value = "forSaleOnly", required = false, defaultValue = "false") boolean forSaleOnly) {
        return variantService.getVariantsByProduct(id, activeOnly, forSaleOnly);
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

    @PatchMapping("/{id}/variants/{vid}")
    public ProductVariantResponse patchVariant(@PathVariable Long id, @PathVariable Long vid,
                                             @Valid @RequestBody ProductVariantPatchRequest req) {
        return variantService.patchVariant(id, vid, req);
    }

    /**
     * Đặt variant mặc định; các variant khác của cùng SP bỏ default.
     */
    @PostMapping("/{id}/default-variant/{variantId}")
    public ProductVariantResponse setDefaultVariant(@PathVariable Long id, @PathVariable Long variantId) {
        return variantService.setDefaultVariant(id, variantId);
    }

    /**
     * Xóa vật lý chỉ khi variant chưa từng dùng (không lô, không dòng chứng từ, không movement).
     * Nếu đã từng dùng → gán {@code is_active=false} (HTTP 200 + body), giữ tồn kho & lịch sử.
     */
    @DeleteMapping("/{id}/variants/{vid}")
    public ResponseEntity<ProductVariantResponse> deleteVariant(@PathVariable Long id, @PathVariable Long vid) {
        ProductVariantResponse body = variantService.deleteVariantOrArchive(id, vid);
        if (body == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(body);
    }

    @GetMapping("/low-stock-variants")
    public List<ProductVariantResponse> getLowStockVariants() {
        return variantService.getLowStockVariants();
    }

    /**
     * GET /api/products/variants/search — paginated variant rows for admin/staff transaction pickers.
     * Matches variant code/name and parent product code/name (case-insensitive). Filters before pagination.
     */
    @GetMapping("/variants/search")
    public Page<ProductVariantSearchResponse> searchVariants(
            @RequestParam String search,
            @RequestParam(required = false, defaultValue = "true") boolean activeOnly,
            @RequestParam(required = false) Boolean sellableOnly,
            @RequestParam(required = false) String context,
            @PageableDefault(size = 20) Pageable pageable) {
        if (!hasAdminOrStaffRole()) {
            throw new AccessDeniedException("Chỉ admin/nhân viên được tìm biến thể giao dịch");
        }
        boolean sellableResolved = sellableOnly != null ? sellableOnly : defaultSellableOnlyForContext(context);
        boolean singleOnly = singleProductOnlyForContext(context);
        String term = search != null ? search.trim() : "";
        if (term.length() < 2) {
            return new PageImpl<>(List.of(), pageable, 0);
        }
        return productService.searchVariantsForTransactions(term, activeOnly, sellableResolved, singleOnly, pageable);
    }

    private static boolean defaultSellableOnlyForContext(String context) {
        if (context == null || context.isBlank()) {
            return false;
        }
        return "pos".equalsIgnoreCase(context.trim());
    }

    /** Receipt/recipe/combo components/stock adjustment use SINGLE products only; POS mirrors sellable catalog surface. */
    private static boolean singleProductOnlyForContext(String context) {
        if (context == null || context.isBlank()) {
            return true;
        }
        String c = context.trim().toLowerCase();
        return !"pos".equals(c);
    }

    /**
     * GET /api/products/variants/by-code/{code}
     * Lookup variant theo mã barcode — dùng khi quét mã vạch tại POS/InvoicesPage.
     * Tìm theo variant_code trước, fallback product.code → default variant.
     * Trả về 404 nếu không tìm thấy.
     */
    @GetMapping("/variants/by-code/{code}")
    public ProductVariantResponse getVariantByCode(@PathVariable String code) {
        return variantService.getVariantByCode(code);
    }
}

