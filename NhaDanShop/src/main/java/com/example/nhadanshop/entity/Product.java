package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "products")
@Getter
@Setter
public class Product {

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

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "expiry_days")
    private Integer expiryDays;

    /**
     * Đơn vị nhập kho: kg, xâu, hộp, bịch, chai...
     */
    @Column(name = "import_unit", length = 20)
    private String importUnit;

    /**
     * Đơn vị bán lẻ: bịch, gói, chai...
     */
    @Column(name = "sell_unit", length = 20)
    private String sellUnit;

    /**
     * Số đơn vị bán lẻ quy đổi từ 1 đơn vị nhập.
     * VD: 1 kg = 10 bịch → piecesPerImportUnit = 10
     * VD: 1 xâu = 7 bịch → piecesPerImportUnit = 7
     * NULL hoặc 1 = bán nguyên (không quy đổi)
     */
    @Column(name = "pieces_per_import_unit")
    private Integer piecesPerImportUnit;

    /**
     * Ghi chú quy đổi. VD: "1 xâu = 7 bịch", "1 kg = 10 gói ~100g"
     */
    @Column(name = "conversion_note", length = 100)
    private String conversionNote;

    /** URL hình ảnh sản phẩm (lưu link external hoặc base64 nhỏ) */
    @Column(name = "image_url", length = 500)
    private String imageUrl;

    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "category_id")
    private Category category;
}