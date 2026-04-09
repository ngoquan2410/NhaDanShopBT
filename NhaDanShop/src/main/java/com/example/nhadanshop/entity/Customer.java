package com.example.nhadanshop.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * Khách hàng — Sprint 2.
 *
 * Nhóm khách:
 *   RETAIL    = Khách lẻ (mặc định)
 *   WHOLESALE = Khách sỉ (giá riêng, không cần thiết cho MVP)
 *   VIP       = Khách VIP (ưu tiên, tích điểm)
 *
 * total_spend tự động cộng mỗi khi tạo hóa đơn cho KH này.
 * debt dự phòng Sprint 3 (công nợ).
 */
@Entity
@Table(name = "customers")
@Getter
@Setter
public class Customer {

    public enum CustomerGroup { RETAIL, WHOLESALE, VIP }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "code", nullable = false, unique = true, length = 50)
    private String code;

    @Column(name = "name", nullable = false, length = 150)
    private String name;

    @Column(name = "phone", length = 20)
    private String phone;

    @Column(name = "address", length = 300)
    private String address;

    @Column(name = "email", length = 100)
    private String email;

    @Enumerated(EnumType.STRING)
    @Column(name = "customer_group", nullable = false, length = 30)
    private CustomerGroup group = CustomerGroup.RETAIL;

    @Column(name = "total_spend", nullable = false, precision = 18, scale = 2)
    private BigDecimal totalSpend = BigDecimal.ZERO;

    /** Công nợ hiện tại — dự phòng Sprint 3 */
    @Column(name = "debt", nullable = false, precision = 18, scale = 2)
    private BigDecimal debt = BigDecimal.ZERO;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "is_active", nullable = false)
    private Boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
        if (active == null) active = true;
        if (group == null) group = CustomerGroup.RETAIL;
        if (totalSpend == null) totalSpend = BigDecimal.ZERO;
        if (debt == null) debt = BigDecimal.ZERO;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
