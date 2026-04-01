package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Combo sản phẩm — gói nhiều sản phẩm bán/nhập cùng nhau.
 *
 * Ví dụ: "Combo Bánh Tráng" = 5 bịch Bánh Tráng Rong Biển + 1 hộp Muối Ớt
 *
 * Khi NHẬP: chọn combo → hệ thống expand thành từng dòng sản phẩm,
 *            chi phí phân bổ đều theo số lượng.
 * Khi BÁN:  chọn combo → hệ thống expand thành từng line item hóa đơn,
 *            giá bán = sellPrice của combo (không phải cộng từng SP).
 */
@Entity
@Table(name = "product_combos")
@Getter
@Setter
public class ProductCombo {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String code;

    @Column(nullable = false, length = 200)
    private String name;

    @Column(length = 1000)
    private String description;

    /** Giá bán combo (admin thiết lập, thường thấp hơn tổng từng SP) */
    @Column(name = "sell_price", nullable = false, precision = 18, scale = 2)
    private BigDecimal sellPrice = BigDecimal.ZERO;

    @Column(nullable = false)
    private Boolean active = true;

    @OneToMany(mappedBy = "combo", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<ProductComboItem> items = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    void preUpdate() { updatedAt = LocalDateTime.now(); }
}
