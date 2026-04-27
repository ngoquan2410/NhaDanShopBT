package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.StorePaymentSettingsDto;
import com.example.nhadanshop.entity.StorePaymentSettingsRecord;
import com.example.nhadanshop.repository.StorePaymentSettingsRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class StorePaymentSettingsService {

    private static final StorePaymentSettingsDto DEFAULT_SETTINGS = new StorePaymentSettingsDto(
            "Nhã Đan Shop",
            false,
            "",
            "",
            "",
            "",
            "",
            "DH",
            "compact2",
            "",
            "",
            "",
            "",
            "",
            ""
    );

    private final StorePaymentSettingsRepository repository;

    public StorePaymentSettingsDto getPaymentSettings() {
        return repository.findById(StorePaymentSettingsRecord.SINGLETON_ID)
                .map(this::toDto)
                .orElse(DEFAULT_SETTINGS);
    }

    public StorePaymentSettingsDto savePaymentSettings(StorePaymentSettingsDto input) {
        StorePaymentSettingsDto normalized = normalize(input);
        StorePaymentSettingsRecord record = repository.findById(StorePaymentSettingsRecord.SINGLETON_ID)
                .orElseGet(StorePaymentSettingsRecord::new);
        apply(record, normalized);
        return toDto(repository.save(record));
    }

    public StorePaymentSettingsDto normalize(StorePaymentSettingsDto input) {
        StorePaymentSettingsDto merged = input == null ? DEFAULT_SETTINGS : new StorePaymentSettingsDto(
                blankToDefault(input.shopName(), DEFAULT_SETTINGS.shopName()),
                input.qrEnabled(),
                normalizeBankId(input.vietQrBankCode()),
                blankToEmpty(input.bankName()),
                sanitizeBankAccountNumber(input.accountNumber()),
                blankToEmpty(input.accountName()),
                blankToEmpty(input.branch()),
                blankToDefault(input.transferPrefix(), DEFAULT_SETTINGS.transferPrefix()),
                blankToDefault(input.qrTemplate(), DEFAULT_SETTINGS.qrTemplate()),
                blankToEmpty(input.momoQrImage()),
                blankToEmpty(input.momoAccountName()),
                blankToEmpty(input.momoPhone()),
                blankToEmpty(input.zalopayQrImage()),
                blankToEmpty(input.zalopayAccountName()),
                blankToEmpty(input.zalopayPhone())
        );
        return merged;
    }

    private void apply(StorePaymentSettingsRecord record, StorePaymentSettingsDto dto) {
        record.setId(StorePaymentSettingsRecord.SINGLETON_ID);
        record.setShopName(dto.shopName());
        record.setQrEnabled(dto.qrEnabled());
        record.setVietQrBankCode(dto.vietQrBankCode());
        record.setBankName(dto.bankName());
        record.setAccountNumber(dto.accountNumber());
        record.setAccountName(dto.accountName());
        record.setBranch(dto.branch());
        record.setTransferPrefix(dto.transferPrefix());
        record.setQrTemplate(dto.qrTemplate());
        record.setMomoQrImage(dto.momoQrImage());
        record.setMomoAccountName(dto.momoAccountName());
        record.setMomoPhone(dto.momoPhone());
        record.setZalopayQrImage(dto.zalopayQrImage());
        record.setZalopayAccountName(dto.zalopayAccountName());
        record.setZalopayPhone(dto.zalopayPhone());
    }

    private StorePaymentSettingsDto toDto(StorePaymentSettingsRecord record) {
        return normalize(new StorePaymentSettingsDto(
                record.getShopName(),
                record.isQrEnabled(),
                record.getVietQrBankCode(),
                record.getBankName(),
                record.getAccountNumber(),
                record.getAccountName(),
                record.getBranch(),
                record.getTransferPrefix(),
                record.getQrTemplate(),
                record.getMomoQrImage(),
                record.getMomoAccountName(),
                record.getMomoPhone(),
                record.getZalopayQrImage(),
                record.getZalopayAccountName(),
                record.getZalopayPhone()
        ));
    }

    private String blankToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private String blankToDefault(String value, String fallback) {
        String normalized = blankToEmpty(value);
        return normalized.isEmpty() ? fallback : normalized;
    }

    private String sanitizeBankAccountNumber(String input) {
        return input == null ? "" : input.replaceAll("\\D", "");
    }

    private String normalizeBankId(String input) {
        String normalized = blankToEmpty(input).toUpperCase();
        return switch (normalized) {
            case "VCB" -> "970436";
            case "TCB" -> "970407";
            case "ACB" -> "970416";
            case "MB" -> "970422";
            case "BIDV" -> "970418";
            case "VPB" -> "970432";
            case "TPB" -> "970423";
            case "STB" -> "970403";
            case "SHB" -> "970443";
            case "VIB" -> "970441";
            case "VBA" -> "970405";
            case "OCB" -> "970448";
            default -> normalized;
        };
    }
}
