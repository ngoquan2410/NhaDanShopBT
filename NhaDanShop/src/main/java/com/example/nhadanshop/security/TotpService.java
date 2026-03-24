package com.example.nhadanshop.security;

import com.example.nhadanshop.dto.TotpSetupResponse;
import dev.samstevens.totp.code.*;
import dev.samstevens.totp.exceptions.QrGenerationException;
import dev.samstevens.totp.qr.QrData;
import dev.samstevens.totp.qr.QrGenerator;
import dev.samstevens.totp.qr.ZxingPngQrGenerator;
import dev.samstevens.totp.secret.DefaultSecretGenerator;
import dev.samstevens.totp.secret.SecretGenerator;
import dev.samstevens.totp.time.SystemTimeProvider;
import dev.samstevens.totp.time.TimeProvider;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Base64;

import static dev.samstevens.totp.util.Utils.getDataUriForImage;

@Slf4j
@Service
public class TotpService {

    @Value("${totp.issuer:NhaDanShop}")
    private String issuer;

    private final SecretGenerator secretGenerator = new DefaultSecretGenerator(32);
    private final TimeProvider timeProvider = new SystemTimeProvider();
    private final CodeGenerator codeGenerator = new DefaultCodeGenerator(HashingAlgorithm.SHA1, 6);
    private final CodeVerifier codeVerifier = new DefaultCodeVerifier(codeGenerator, timeProvider);

    /**
     * Tạo secret mới + QR code data URI để hiển thị trên FE.
     */
    public TotpSetupResponse generateSetup(String username) {
        String secret = secretGenerator.generate();

        QrData qrData = new QrData.Builder()
                .label(username)
                .secret(secret)
                .issuer(issuer)
                .algorithm(HashingAlgorithm.SHA1)
                .digits(6)
                .period(30)
                .build();

        String qrCodeImage = "";
        try {
            QrGenerator generator = new ZxingPngQrGenerator();
            byte[] imageData = generator.generate(qrData);
            qrCodeImage = getDataUriForImage(imageData, generator.getImageMimeType());
        } catch (QrGenerationException e) {
            log.warn("Cannot generate QR image: {}", e.getMessage());
        }

        return new TotpSetupResponse(secret, qrData.getUri(), qrCodeImage);
    }

    /**
     * Xác thực mã OTP 6 chữ số với secret đã lưu trong DB.
     * Dùng window = 1 (chấp nhận lệch ±30s với đồng hồ server).
     */
    public boolean verifyCode(String secret, String code) {
        if (secret == null || code == null || code.length() != 6) return false;
        try {
            ((DefaultCodeVerifier) codeVerifier).setTimePeriod(30);
            ((DefaultCodeVerifier) codeVerifier).setAllowedTimePeriodDiscrepancy(1);
            return codeVerifier.isValidCode(secret, code);
        } catch (Exception e) {
            log.warn("TOTP verify error: {}", e.getMessage());
            return false;
        }
    }
}
