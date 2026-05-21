package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.dto.ShippingQuoteRequest;
import com.example.nhadanshop.dto.ShippingQuoteResponse;
import com.example.nhadanshop.entity.GhnQuoteLog;
import com.example.nhadanshop.repository.GhnQuoteLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.Normalizer;
import java.time.Instant;
import java.util.List;
import java.util.Locale;

@Slf4j
@Service
@RequiredArgsConstructor
public class ShippingQuoteService {

    private final GhnShippingService ghnShippingService;
    private final ShippingSettingsService shippingSettingsService;
    private final GhnQuoteLogRepository ghnQuoteLogRepository;

    public ShippingQuoteResponse quote(ShippingQuoteRequest request) {
        long wallStartNs = System.nanoTime();
        ShippingSettingsService.ResolvedShippingQuoteConfig cfg = shippingSettingsService.resolveForQuote();
        ShippingAddressDto address = request.address();
        ShippingQuoteResponse result;
        if (isBlank(address.provinceCode()) || isBlank(address.districtCode()) || isBlank(address.wardCode())) {
            result = new ShippingQuoteResponse(
                    "incomplete",
                    null,
                    null,
                    null,
                    null,
                    "Thiếu: " + missingFields(address),
                    null,
                    null,
                    null,
                    null,
                    Instant.now().toString()
            );
        } else {
            ShippingSettingsService.ResolvedLocalRule localRule = pickLocalRule(address, cfg.localRules());
            if (localRule != null) {
                result = new ShippingQuoteResponse(
                        "quoted",
                        "local_rule",
                        localRule.zoneCode(),
                        BigDecimal.valueOf(localRule.fee()).setScale(0, RoundingMode.HALF_UP),
                        new ShippingQuoteResponse.EtaDaysDto(localRule.etaDays().min(), localRule.etaDays().max()),
                        null,
                        false,
                        false,
                        null,
                        0L,
                        Instant.now().toString()
                );
                persistGhnQuoteLog(request, result, wallStartNs);
                return result;
            }

            int weight = request.weightGrams() != null ? request.weightGrams() : cfg.parcelDefaults().weightGrams();
            int length = request.parcel() != null && request.parcel().length() != null
                    ? request.parcel().length()
                    : cfg.parcelDefaults().length();
            int width = request.parcel() != null && request.parcel().width() != null
                    ? request.parcel().width()
                    : cfg.parcelDefaults().width();
            int height = request.parcel() != null && request.parcel().height() != null
                    ? request.parcel().height()
                    : cfg.parcelDefaults().height();
            BigDecimal insuranceValue = request.declaredValue() != null
                    ? request.declaredValue()
                    : deriveInsuranceValue(request.subtotal(), cfg);

            try {
                GhnShippingService.CarrierQuote carrierQuote = ghnShippingService.quote(
                        address,
                        weight,
                        length,
                        width,
                        height,
                        insuranceValue
                );
                BigDecimal fee = carrierQuote.fee().setScale(0, RoundingMode.HALF_UP);
                result = new ShippingQuoteResponse(
                        "quoted",
                        "carrier_api",
                        null,
                        fee,
                        new ShippingQuoteResponse.EtaDaysDto(carrierQuote.etaDays().min(), carrierQuote.etaDays().max()),
                        null,
                        false,
                        null,
                        null,
                        carrierQuote.latencyMs(),
                        Instant.now().toString()
                );
            } catch (GhnShippingService.CarrierFailure failure) {
                ShippingQuoteResponse fallback = fallbackQuote(request, failure.reason(), failure.latencyMs(), cfg);
                if (fallback != null) {
                    result = fallback;
                } else {
                    result = new ShippingQuoteResponse(
                            "unavailable",
                            null,
                            null,
                            null,
                            null,
                            failure.getMessage(),
                            null,
                            null,
                            null,
                            failure.latencyMs(),
                            Instant.now().toString()
                    );
                }
            }
        }

        persistGhnQuoteLog(request, result, wallStartNs);
        return result;
    }

    private void persistGhnQuoteLog(ShippingQuoteRequest request, ShippingQuoteResponse out, long wallStartNs) {
        try {
            ShippingAddressDto a = request.address();
            GhnQuoteLog row = new GhnQuoteLog();
            row.setProvinceName(a.provinceName());
            row.setDistrictName(a.districtName());
            row.setWardName(a.wardName());
            row.setWeightGrams(request.weightGrams());
            row.setSubtotal(request.subtotal());
            row.setOrderCode(request.orderCode());
            boolean ok = "quoted".equals(out.status());
            row.setOk(ok);
            row.setFee(out.fee());
            if (out.etaDays() != null) {
                row.setEtaMin(out.etaDays().min());
                row.setEtaMax(out.etaDays().max());
            }
            if (!ok) {
                if (out.fallbackReason() != null) {
                    row.setReason(truncate(out.fallbackReason(), 64));
                } else if ("incomplete".equals(out.status())) {
                    row.setReason("incomplete");
                } else if ("unavailable".equals(out.status())) {
                    row.setReason("unavailable");
                } else {
                    row.setReason("quote_failed");
                }
                row.setMessage(truncate(out.reasonIfUnavailable(), 4000));
            }
            long lat = out.latencyMs() != null ? out.latencyMs() : (System.nanoTime() - wallStartNs) / 1_000_000L;
            row.setLatencyMs(lat);
            ghnQuoteLogRepository.save(row);
        } catch (Exception ex) {
            log.warn("Failed to persist GHN quote log", ex);
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private ShippingQuoteResponse fallbackQuote(
            ShippingQuoteRequest request,
            String reason,
            long latencyMs,
            ShippingSettingsService.ResolvedShippingQuoteConfig cfg
    ) {
        ShippingSettingsService.ResolvedZoneRule rule = pickZone(request.address().provinceCode(), cfg.zoneRules());
        if (rule == null) {
            return null;
        }
        int weight = request.weightGrams() != null ? request.weightGrams() : cfg.parcelDefaults().weightGrams();
        int surcharge = Math.max(0, (int) Math.ceil((weight - 1000) / 500.0)) * 3000;
        BigDecimal fee = BigDecimal.valueOf(rule.baseFee() + surcharge);
        return new ShippingQuoteResponse(
                "quoted",
                "zone_fallback",
                rule.zoneCode(),
                fee.setScale(0, RoundingMode.HALF_UP),
                new ShippingQuoteResponse.EtaDaysDto(rule.etaDays().min(), rule.etaDays().max()),
                null,
                false,
                true,
                reason,
                latencyMs,
                Instant.now().toString()
        );
    }

    private String missingFields(ShippingAddressDto address) {
        StringBuilder missing = new StringBuilder();
        appendMissing(missing, address.provinceCode(), "Tỉnh/Thành");
        appendMissing(missing, address.districtCode(), "Quận/Huyện");
        appendMissing(missing, address.wardCode(), "Phường/Xã");
        return missing.toString();
    }

    private void appendMissing(StringBuilder builder, String value, String label) {
        if (!isBlank(value)) {
            return;
        }
        if (!builder.isEmpty()) {
            builder.append(", ");
        }
        builder.append(label);
    }

    private BigDecimal deriveInsuranceValue(
            BigDecimal subtotal,
            ShippingSettingsService.ResolvedShippingQuoteConfig cfg
    ) {
        ShippingSettingsService.ResolvedParcelDefaults p = cfg.parcelDefaults();
        String mode = p.declaredValueMode();
        if ("subtotal".equals(mode)) {
            return subtotal.min(BigDecimal.valueOf(5_000_000L));
        }
        if ("fixed".equals(mode) && p.declaredValueFixed() != null) {
            return p.declaredValueFixed().min(BigDecimal.valueOf(5_000_000L));
        }
        return BigDecimal.ZERO;
    }

    private ShippingSettingsService.ResolvedZoneRule pickZone(
            String provinceCode,
            List<ShippingSettingsService.ResolvedZoneRule> zoneRules
    ) {
        ShippingSettingsService.ResolvedZoneRule direct = zoneRules.stream()
                .filter(rule -> rule.provinceCodes().contains(provinceCode))
                .findFirst()
                .orElse(null);
        if (direct != null) {
            return direct;
        }
        return zoneRules.stream()
                .filter(rule -> rule.provinceCodes().contains("*"))
                .findFirst()
                .orElse(null);
    }

    private ShippingSettingsService.ResolvedLocalRule pickLocalRule(
            ShippingAddressDto address,
            List<ShippingSettingsService.ResolvedLocalRule> localRules
    ) {
        if (localRules == null || localRules.isEmpty()) {
            return null;
        }
        return localRules.stream()
                .filter(ShippingSettingsService.ResolvedLocalRule::enabled)
                .filter(rule -> matchesDimension(address.provinceCode(), address.provinceName(), rule.provinceCodes(), rule.provinceNames()))
                .filter(rule -> matchesDimension(address.districtCode(), address.districtName(), rule.districtCodes(), rule.districtNames()))
                .filter(rule -> matchesDimension(address.wardCode(), address.wardName(), rule.wardCodes(), rule.wardNames()))
                .findFirst()
                .orElse(null);
    }

    private boolean matchesDimension(String code, String name, List<String> ruleCodes, List<String> ruleNames) {
        boolean hasCodes = ruleCodes != null && !ruleCodes.isEmpty();
        boolean hasNames = ruleNames != null && !ruleNames.isEmpty();
        if (hasCodes && !isBlank(code) && ruleCodes.stream().anyMatch(c -> c.equalsIgnoreCase(code.trim()))) {
            return true;
        }
        if (hasNames && !isBlank(name)) {
            String normalizedName = normalizeVietnamese(name);
            if (ruleNames.stream().map(this::normalizeVietnamese).anyMatch(normalizedName::equals)) {
                return true;
            }
        }
        return !hasCodes && !hasNames;
    }

    private String normalizeVietnamese(String value) {
        if (value == null) {
            return "";
        }
        String noAccent = Normalizer.normalize(value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .replace('Đ', 'D')
                .replace('đ', 'd');
        return noAccent.toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", " ")
                .replaceFirst("^(tinh|thanh pho|tp|quan|huyen|thi xa|phuong|xa|thi tran)\\s+", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
