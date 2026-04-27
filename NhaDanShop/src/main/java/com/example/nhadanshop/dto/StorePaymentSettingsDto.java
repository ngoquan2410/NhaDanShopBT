package com.example.nhadanshop.dto;

import jakarta.validation.constraints.Size;

public record StorePaymentSettingsDto(
        @Size(max = 255) String shopName,
        boolean qrEnabled,
        @Size(max = 50) String vietQrBankCode,
        @Size(max = 255) String bankName,
        @Size(max = 50) String accountNumber,
        @Size(max = 255) String accountName,
        @Size(max = 255) String branch,
        @Size(max = 50) String transferPrefix,
        @Size(max = 30) String qrTemplate,
        String momoQrImage,
        @Size(max = 255) String momoAccountName,
        @Size(max = 50) String momoPhone,
        String zalopayQrImage,
        @Size(max = 255) String zalopayAccountName,
        @Size(max = 50) String zalopayPhone
) {}
