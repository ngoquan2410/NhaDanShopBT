package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "products")
@Getter
@Setter
public class Product {

    /** Loại sản phẩm — theo mô hình KiotViet */
    public enum ProductType {
        SINGLE,  // Sản phẩm đơn lẻ (mặc định)
        COMBO    // Combo = tập hợp nhiều SINGLE product
    }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code", nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 150)
    private String name;

    @Column(nullable = false, length = 20)
    private String unit = "goi";

    @Column(name = "cost_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal costPrice;

    @Column(name = "sell_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal sellPrice;

    @Column(name = "stock_quantity", nullable = false)
    private Integer stockQty = 0;

    @Column(name = "is_active", nullable = false)
    private Boolean active = true;

    /**
     * Loại sản phẩm: SINGLE (mặc định) hoặc COMBO.
     * COMBO product có stockQty ảo = min(component.stock / component.qty).
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "product_type", nullable = false, length = 20)
    private ProductType productType = ProductType.SINGLE;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "expiry_days")
    private Integer expiryDays;

    /** Đơn vị nhập kho: kg, xâu, hộp, bịch, chai... */
    @Column(name = "import_unit", length = 20)
    private String importUnit;

    /** Đơn vị bán lẻ: bịch, gói, chai... */
    @Column(name = "sell_unit", length = 20)
    private String sellUnit;

    /**
     * Số đơn vị bán lẻ quy đổi từ 1 đơn vị nhập.
     * VD: 1 kg = 10 bịch → piecesPerImportUnit = 10
     */
    @Column(name = "pieces_per_import_unit")
    private Integer piecesPerImportUnit;

    @Column(name = "conversion_note", length = 100)
    private String conversionNote;

    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "category_id")
    private Category category;

    /**
     * Các thành phần của combo (chỉ có giá trị khi productType = COMBO).
     */
    @OneToMany(mappedBy = "comboProduct", cascade = CascadeType.ALL,
               orphanRemoval = true, fetch = FetchType.LAZY)
    private List<ProductComboItem> comboItems = new ArrayList<>();

    /**
     * Các đơn vị nhập kho đã đăng ký cho SP này (chỉ SINGLE).
     */
    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL,
               orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("isDefault DESC, importUnit ASC")
    private List<ProductImportUnit> importUnits = new ArrayList<>();

    /**
     * Các biến thể đóng gói của SP này (Sprint 0).
     * VD: Muối ABC → [ABC-HU100: hủ 100g, ABC-GOI50: gói 50g]
     * Mỗi variant là 1 đơn vị giao dịch độc lập.
     * COMBO product không có variants (xử lý riêng).
     */
    @OneToMany(mappedBy = "product", cascade = CascadeType.ALL,
               orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("isDefault DESC, variantCode ASC")
    private List<ProductVariant> variants = new ArrayList<>();

    /** Tiện ích: kiểm tra có phải combo không */
    public boolean isCombo() {
        return ProductType.COMBO.equals(productType);
    }

    /** Lấy default variant (nullable) */
    public ProductVariant getDefaultVariant() {
        return variants.stream()
                .filter(v -> Boolean.TRUE.equals(v.getIsDefault()))
                .findFirst()
                .orElse(null);
    }
}
