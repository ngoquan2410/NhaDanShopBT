package com.example.nhadanshop.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;

@Getter
@Setter
@Entity
@Table(name = "store_payment_settings")
public class StorePaymentSettingsRecord {

    public static final long SINGLETON_ID = 1L;

    @Id
    private Long id = SINGLETON_ID;

    @Column(name = "shop_name", length = 255)
    private String shopName;

    @Column(name = "qr_enabled", nullable = false)
    private boolean qrEnabled;

    @Column(name = "viet_qr_bank_code", length = 50)
    private String vietQrBankCode;

    @Column(name = "bank_name", length = 255)
    private String bankName;

    @Column(name = "account_number", length = 50)
    private String accountNumber;

    @Column(name = "account_name", length = 255)
    private String accountName;

    @Column(name = "branch", length = 255)
    private String branch;

    @Column(name = "transfer_prefix", length = 50)
    private String transferPrefix;

    @Column(name = "qr_template", length = 30)
    private String qrTemplate;

    @Column(name = "momo_qr_image", columnDefinition = "TEXT")
    private String momoQrImage;

    @Column(name = "momo_account_name", length = 255)
    private String momoAccountName;

    @Column(name = "momo_phone", length = 50)
    private String momoPhone;

    @Column(name = "zalopay_qr_image", columnDefinition = "TEXT")
    private String zalopayQrImage;

    @Column(name = "zalopay_account_name", length = 255)
    private String zalopayAccountName;

    @Column(name = "zalopay_phone", length = 50)
    private String zalopayPhone;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    void prePersist() {
        LocalDateTime now = LocalDateTime.now();
        if (id == null) {
            id = SINGLETON_ID;
        }
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
    }

    @PreUpdate
    void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
