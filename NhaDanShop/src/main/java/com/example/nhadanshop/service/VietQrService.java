package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.StorePaymentSettingsDto;
import com.example.nhadanshop.dto.VietQrGenerateRequest;
import com.example.nhadanshop.dto.VietQrResultDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@Service
@RequiredArgsConstructor
public class VietQrService {

    @Value("${vietqr.image-base-url:https://img.vietqr.io/image}")
    private String vietQrImageBaseUrl;

    private final StorePaymentSettingsService settingsService;

    public VietQrResultDto generate(VietQrGenerateRequest request) {
        StorePaymentSettingsDto settings = request.settingsOverride() != null
                ? settingsService.normalize(request.settingsOverride())
                : settingsService.getPaymentSettings();

        if (!settings.qrEnabled() || isBlank(settings.vietQrBankCode()) || isBlank(settings.accountNumber())) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "VietQR chưa được cấu hình. Vào 'Cài đặt cửa hàng' để thiết lập."
            );
        }

        String bankId = normalizeBankId(settings.vietQrBankCode());
        String accountNumber = sanitizeBankAccountNumber(settings.accountNumber());
        if (isBlank(bankId) || !isPlausibleBankAccountNumber(accountNumber)) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Tài khoản thụ hưởng không hợp lệ. Cửa hàng cần kiểm tra lại ngân hàng và số tài khoản nhận tiền."
            );
        }

        String template = isBlank(settings.qrTemplate()) ? "compact2" : settings.qrTemplate();
        String safeAccountName = sanitizeAscii(settings.accountName(), 25);
        String safeAddInfo = sanitizeAscii(request.transferContent(), 25);

        StringBuilder query = new StringBuilder()
                .append("amount=").append(Math.max(0, request.amount().setScale(0, RoundingMode.HALF_UP).intValue()))
                .append("&addInfo=").append(encode(safeAddInfo))
                .append("&accountName=").append(encode(safeAccountName));
        if (!isBlank(request.cacheKey())) {
            query.append("&_v=").append(encode(request.cacheKey()));
        }

        String base = vietQrImageBaseUrl.replaceAll("/+$", "");
        String imageUrl = "%s/%s-%s-%s.png?%s".formatted(
                base,
                encode(bankId),
                encode(accountNumber),
                template,
                query
        );
        String scanImageUrl = "%s/%s-%s-qr_only.png?%s".formatted(
                base,
                encode(bankId),
                encode(accountNumber),
                query
        );

        return new VietQrResultDto(
                imageUrl,
                scanImageUrl,
                imageUrl,
                settings.bankName(),
                accountNumber,
                settings.accountName(),
                request.amount(),
                safeAddInfo,
                template
        );
    }

    private String sanitizeAscii(String input, int maxLen) {
        return (input == null ? "" : input)
                .trim()
                .replace("đ", "d")
                .replace("Đ", "D")
                .replaceAll("\\p{M}", "")
                .replaceAll("[^A-Za-z0-9 ]", " ")
                .replaceAll("\\s+", " ")
                .trim()
                .toUpperCase()
                .substring(0, Math.min(maxLen, Math.max(0, (input == null ? "" : input)
                        .trim()
                        .replace("đ", "d")
                        .replace("Đ", "D")
                        .replaceAll("\\p{M}", "")
                        .replaceAll("[^A-Za-z0-9 ]", " ")
                        .replaceAll("\\s+", " ")
                        .trim()
                        .toUpperCase()
                        .length())));
    }

    private String sanitizeBankAccountNumber(String input) {
        return input == null ? "" : input.replaceAll("\\D", "");
    }

    private boolean isPlausibleBankAccountNumber(String input) {
        return input != null && input.matches("^\\d{6,19}$");
    }

    private String normalizeBankId(String input) {
        return input == null ? "" : input.trim();
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
