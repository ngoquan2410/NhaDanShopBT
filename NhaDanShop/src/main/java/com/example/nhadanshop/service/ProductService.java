package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ProductRequest;
import com.example.nhadanshop.dto.ProductResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.entity.Product;
import com.example.nhadanshop.repository.CategoryRepository;
import com.example.nhadanshop.repository.ProductRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import com.example.nhadanshop.dto.StockCheckRequest;
import com.example.nhadanshop.dto.StockCheckResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.example.nhadanshop.repository.PendingOrderRepository;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductService {

    private final ProductRepository productRepository;
    private final CategoryRepository categoryRepository;
    private final PendingOrderRepository pendingOrderRepository;
    @org.springframework.context.annotation.Lazy
    private final ProductVariantService variantService; // Sprint 0 — @Lazy tránh circular dep

    /** Build map productId → pending reserved qty (chỉ PENDING còn hạn) */
    private Map<Long, Integer> buildPendingMap() {
        Map<Long, Integer> map = new HashMap<>();
        pendingOrderRepository.sumPendingQtyByProduct(LocalDateTime.now())
                .forEach(row -> map.put((Long) row[0], ((Number) row[1]).intValue()));
        return map;
    }

    public List<ProductResponse> findAll() {
        Map<Long, Integer> pendingMap = buildPendingMap();
        return productRepository.findByActiveTrue()
                .stream()
                .map(p -> {
                    int reserved = pendingMap.getOrDefault(p.getId(), 0);
                    int available = Math.max(0, p.getStockQty() - reserved);
                    return DtoMapper.toResponse(p, available);
                }).toList();
    }

    public Page<ProductResponse> findByCategory(Long categoryId, Pageable pageable) {
        Map<Long, Integer> pendingMap = buildPendingMap();
        return productRepository.findByCategoryIdAndActiveTrue(categoryId, pageable)
                .map(p -> {
                    int reserved = pendingMap.getOrDefault(p.getId(), 0);
                    int available = Math.max(0, p.getStockQty() - reserved);
                    return DtoMapper.toResponse(p, available);
                });
    }

    public ProductResponse findById(Long id) {
        return DtoMapper.toResponse(findEntityById(id));
    }

    /**
     * Kiểm tra tồn kho khả dụng cho danh sách sản phẩm trước khi checkout.
     * availableQty = stockQty - tổng qty đang bị giữ bởi PENDING orders còn hạn.
     */
    public StockCheckResponse checkStock(StockCheckRequest req) {
        Map<Long, Integer> pendingMap = buildPendingMap();
        List<StockCheckResponse.Conflict> conflicts = new ArrayList<>();

        for (StockCheckRequest.Item item : req.items()) {
            Product p = productRepository.findById(item.productId()).orElse(null);
            if (p == null || !p.getActive()) {
                conflicts.add(new StockCheckResponse.Conflict(
                        item.productId(),
                        p != null ? p.getName() : "Không tìm thấy sản phẩm",
                        p != null ? (p.getSellUnit() != null ? p.getSellUnit() : p.getUnit()) : "",
                        item.quantity(), 0));
                continue;
            }
            int reserved = pendingMap.getOrDefault(p.getId(), 0);
            int available = Math.max(0, p.getStockQty() - reserved);
            if (item.quantity() > available) {
                conflicts.add(new StockCheckResponse.Conflict(
                        p.getId(), p.getName(),
                        p.getSellUnit() != null ? p.getSellUnit() : p.getUnit(),
                        item.quantity(), available));
            }
        }
        return new StockCheckResponse(conflicts.isEmpty(), conflicts);
    }

    @Transactional
    public ProductResponse create(ProductRequest req) {
        var category = categoryRepository.findById(req.categoryId())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + req.categoryId()));

        // Check trùng tên + danh mục trước
        if (productRepository.existsByNameIgnoreCaseAndCategoryId(req.name().trim(), category.getId())) {
            throw new IllegalStateException(
                "Sản phẩm '" + req.name().trim() + "' đã tồn tại trong danh mục '" + category.getName() + "'");
        }

        // Code bắt buộc nhập — không auto generate
        String code = req.code().trim().toUpperCase();

        if (productRepository.existsByCode(code)) {
            throw new IllegalStateException("Mã sản phẩm '" + code + "' đã tồn tại");
        }

        Product p = new Product();
        p.setCode(code);
        p.setName(req.name());
        p.setCategory(category);
        p.setUnit(req.unit());
        p.setCostPrice(req.costPrice());
        p.setSellPrice(req.sellPrice());
        p.setExpiryDays(req.expiryDays());
        p.setImportUnit(req.importUnit());
        p.setSellUnit(req.sellUnit());
        p.setPiecesPerImportUnit(req.piecesPerImportUnit());
        p.setConversionNote(req.conversionNote());
        p.setImageUrl(req.imageUrl());
        // Quy đổi tồn kho ban đầu → đơn vị bán lẻ (bịch/hộp thì không nhân)
        p.setStockQty(UnitConverter.toRetailQty(
                req.importUnit(), req.piecesPerImportUnit(),
                req.stockQty() != null ? req.stockQty() : 0));
        p.setActive(req.active() == null ? true : req.active());
        p.setCreatedAt(LocalDateTime.now());
        p.setUpdatedAt(LocalDateTime.now());

        // saveAndFlush: đảm bảo Hibernate flush + assign đúng ID trước khi tạo variant
        Product saved = productRepository.saveAndFlush(p);

        // [Sprint 0] Tự tạo default variant cho SP mới (chỉ SINGLE)
        if (!saved.isCombo()) {
            variantService.createDefaultVariantFromProduct(saved);
        }

        return DtoMapper.toResponse(saved);
    }

    @Transactional
    public ProductResponse update(Long id, ProductRequest req) {
        Product p = findEntityById(id);
        // Nếu không cung cấp code mới → giữ nguyên code cũ
        String newCode = (req.code() != null && !req.code().isBlank())
                ? req.code().trim().toUpperCase()
                : p.getCode();
        if (!newCode.equals(p.getCode()) && productRepository.existsByCodeAndIdNot(newCode, id)) {
            throw new IllegalStateException("Mã sản phẩm '" + newCode + "' đã được dùng bởi sản phẩm khác");
        }
        var category = categoryRepository.findById(req.categoryId())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + req.categoryId()));

        p.setCode(newCode);
        p.setName(req.name());
        p.setCategory(category);
        p.setUnit(req.unit());
        p.setCostPrice(req.costPrice());
        p.setSellPrice(req.sellPrice());
        if (req.stockQty() != null) p.setStockQty(req.stockQty());
        p.setActive(req.active() == null ? p.getActive() : req.active());
        p.setExpiryDays(req.expiryDays());
        p.setImportUnit(req.importUnit());
        p.setSellUnit(req.sellUnit());
        p.setPiecesPerImportUnit(req.piecesPerImportUnit());
        p.setConversionNote(req.conversionNote());
        p.setImageUrl(req.imageUrl());
        p.setUpdatedAt(LocalDateTime.now());

        return DtoMapper.toResponse(productRepository.save(p));
    }

    @Transactional
    public void softDelete(Long id) {
        Product p = findEntityById(id);
        p.setActive(false);
        p.setUpdatedAt(LocalDateTime.now());
        productRepository.save(p);
    }

    /**
     * Tạo hàng loạt sản phẩm trong 1 request.
     * - Nếu code đã tồn tại → skip (không throw lỗi, ghi vào skipped list).
     * - Nếu categoryId không tồn tại → ghi lỗi vào errors list.
     * - Trả về BatchCreateResult gồm: created, skipped, errors.
     */
    @Transactional
    public BatchCreateResult createBatch(List<ProductRequest> requests) {
        List<ProductResponse> created = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        for (ProductRequest req : requests) {
            try {
                var category = categoryRepository.findById(req.categoryId()).orElse(null);
                if (category == null) {
                    errors.add((req.code() != null ? req.code() : "?") + " (" + req.name() + ") - categoryId " + req.categoryId() + " không tồn tại");
                    continue;
                }

                String code = (req.code() != null && !req.code().isBlank())
                        ? req.code().trim().toUpperCase()
                        : null;

                if (code == null || code.isBlank()) {
                    errors.add((req.name()) + " - mã sản phẩm (code) không được để trống");
                    continue;
                }

                if (productRepository.existsByCode(code)) {
                    skipped.add(code + " (" + req.name() + ") - mã đã tồn tại");
                    continue;
                }
                Product p = new Product();
                p.setCode(code);
                p.setName(req.name());
                p.setCategory(category);
                p.setUnit(req.unit());
                p.setCostPrice(req.costPrice());
                p.setSellPrice(req.sellPrice());
                p.setExpiryDays(req.expiryDays());
                p.setImportUnit(req.importUnit());
                p.setSellUnit(req.sellUnit());
                p.setPiecesPerImportUnit(req.piecesPerImportUnit());
                p.setConversionNote(req.conversionNote());
                p.setStockQty(UnitConverter.toRetailQty(
                        req.importUnit(), req.piecesPerImportUnit(),
                        req.stockQty() != null ? req.stockQty() : 0));
                p.setActive(req.active() == null ? true : req.active());
                p.setCreatedAt(LocalDateTime.now());
                p.setUpdatedAt(LocalDateTime.now());
                created.add(DtoMapper.toResponse(productRepository.save(p)));
            } catch (Exception e) {
                errors.add((req.code() != null ? req.code() : "?") + " (" + req.name() + ") - lỗi: " + e.getMessage());
            }
        }
        return new BatchCreateResult(created.size(), skipped.size(), errors.size(), created, skipped, errors);
    }

    public record BatchCreateResult(
            int totalCreated,
            int totalSkipped,
            int totalErrors,
            List<ProductResponse> created,
            List<String> skipped,
            List<String> errors
    ) {}

    // ── Code Generation ───────────────────────────────────────────────────────

    /**
     * Nếu caller cung cấp code (không null/blank) → dùng luôn.
     * Ngược lại → auto-generate theo category.
     */
    private String resolveCode(String requestedCode, Category category) {
        if (requestedCode != null && !requestedCode.isBlank()) {
            return requestedCode.trim().toUpperCase();
        }
        return generateProductCode(category);
    }

    /**
     * Generate product code theo category.
     * Prefix = viết tắt từ tên category (lấy chữ cái đầu của mỗi từ, in hoa, tối đa 4 ký tự).
     * Số thứ tự = số lớn nhất hiện có + 1, format 3 chữ số (001, 002, ...).
     *
     * VD: "Bánh Tráng" → prefix "BT", code hiện có BT005 → generate BT006.
     * VD: "Nước Uống Đóng Chai" → prefix "NUDC", code hiện có NUDC001 → generate NUDC002.
     */
    public String generateProductCode(Category category) {
        String prefix = buildPrefix(category.getName());
        List<String> existingCodes = productRepository.findAllCodesByCategoryId(category.getId());
        int maxSeq = extractMaxSequence(existingCodes, prefix);
        int nextSeq = maxSeq + 1;
        // Nếu nextSeq > 999 thì dùng 4 chữ số
        String format = nextSeq > 999 ? "%s%04d" : "%s%03d";
        String candidate = String.format(format, prefix, nextSeq);
        // Đảm bảo không trùng với sản phẩm ở category khác
        int safety = 0;
        while (productRepository.existsByCode(candidate) && safety < 1000) {
            nextSeq++;
            candidate = String.format(nextSeq > 999 ? "%s%04d" : "%s%03d", prefix, nextSeq);
            safety++;
        }
        return candidate;
    }

    /**
     * Lấy prefix từ tên category: viết tắt chữ cái đầu mỗi từ, in hoa, tối đa 4 ký tự.
     * Loại bỏ dấu tiếng Việt trước khi lấy chữ cái đầu.
     * VD: "Bánh Tráng" → "BT", "Nước Uống Đóng Chai" → "NUDC", "Rau Củ" → "RC"
     */
    static String buildPrefix(String categoryName) {
        if (categoryName == null || categoryName.isBlank()) return "SP";
        String normalized = removeVietnameseDiacritics(categoryName.trim());
        String[] words = normalized.split("\\s+");
        StringBuilder sb = new StringBuilder();
        for (String word : words) {
            if (!word.isEmpty() && sb.length() < 4) {
                sb.append(Character.toUpperCase(word.charAt(0)));
            }
        }
        return sb.length() == 0 ? "SP" : sb.toString();
    }

    /**
     * Tìm số thứ tự lớn nhất trong danh sách code có cùng prefix.
     * VD: ["BT001", "BT005", "BT002"] với prefix "BT" → 5
     */
    static int extractMaxSequence(List<String> codes, String prefix) {
        Pattern pattern = Pattern.compile("^" + Pattern.quote(prefix) + "(\\d+)$", Pattern.CASE_INSENSITIVE);
        int max = 0;
        for (String code : codes) {
            if (code == null) continue;
            Matcher m = pattern.matcher(code.trim());
            if (m.matches()) {
                try {
                    int seq = Integer.parseInt(m.group(1));
                    if (seq > max) max = seq;
                } catch (NumberFormatException ignored) {}
            }
        }
        return max;
    }

    /** Bỏ dấu tiếng Việt để tạo prefix ASCII */
    private static String removeVietnameseDiacritics(String s) {
        String[][] map = {
            {"à","á","â","ã","ä","å","ă","ắ","ặ","ẵ","ằ","ẳ","ấ","ầ","ẩ","ẫ","ậ"}, {"a"},
            {"è","é","ê","ë","ẹ","ẻ","ẽ","ế","ề","ệ","ể","ễ"}, {"e"},
            {"ì","í","î","ï","ị","ỉ","ĩ"}, {"i"},
            {"ò","ó","ô","õ","ö","ø","ọ","ỏ","ố","ồ","ổ","ỗ","ộ","ớ","ờ","ở","ỡ","ợ","ơ"}, {"o"},
            {"ù","ú","û","ü","ụ","ủ","ũ","ứ","ừ","ử","ữ","ự","ư"}, {"u"},
            {"ỳ","ý","ỵ","ỷ","ỹ"}, {"y"},
            {"đ"}, {"d"},
            {"À","Á","Â","Ã","Ä","Å","Ă","Ắ","Ặ","Ẵ","Ằ","Ẳ","Ấ","Ầ","Ẩ","Ẫ","Ậ"}, {"A"},
            {"È","É","Ê","Ë","Ẹ","Ẻ","Ẽ","Ế","Ề","Ệ","Ể","Ễ"}, {"E"},
            {"Ì","Í","Î","Ï","Ị","Ỉ","Ĩ"}, {"I"},
            {"Ò","Ó","Ô","Õ","Ö","Ø","Ọ","Ỏ","Ố","Ồ","Ổ","Ỗ","Ộ","Ớ","Ờ","Ở","Ỡ","Ợ","Ơ"}, {"O"},
            {"Ù","Ú","Û","Ü","Ụ","Ủ","Ũ","Ứ","Ừ","Ử","Ữ","Ự","Ư"}, {"U"},
            {"Ỳ","Ý","Ỵ","Ỷ","Ỹ"}, {"Y"},
            {"Đ"}, {"D"},
        };
        String result = s;
        for (int i = 0; i < map.length - 1; i += 2) {
            for (String from : map[i]) {
                result = result.replace(from, map[i + 1][0]);
            }
        }
        return result;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private Product findEntityById(Long id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy sản phẩm ID: " + id));
    }
}