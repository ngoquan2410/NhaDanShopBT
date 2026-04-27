package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ShippingAddressDto;
import com.example.nhadanshop.dto.ShippingQuoteRequest;
import com.example.nhadanshop.dto.ShippingQuoteResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
public class ShippingQuoteService {

    private static final ShippingConfig DEFAULT_CONFIG = new ShippingConfig(
            List.of(
                    new ZoneRule("Z1", 18000, 200000, new EtaDays(1, 2), List.of("01", "79")),
                    new ZoneRule("Z2", 28000, 350000, new EtaDays(2, 3), List.of("74", "75", "77", "80", "27", "33", "30", "26", "72", "31")),
                    new ZoneRule("Z3", 38000, 500000, new EtaDays(3, 5), List.of("*"))
            ),
            new ParcelDefaults(10, 10, 10, 500, "none", null)
    );

    private final GhnShippingService ghnShippingService;

    public ShippingQuoteResponse quote(ShippingQuoteRequest request) {
        ShippingAddressDto address = request.address();
        if (isBlank(address.provinceCode()) || isBlank(address.districtCode()) || isBlank(address.wardCode())) {
            return new ShippingQuoteResponse(
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
                    null
            );
        }

        int weight = request.weightGrams() != null ? request.weightGrams() : DEFAULT_CONFIG.parcelDefaults().weightGrams();
        int length = request.parcel() != null && request.parcel().length() != null
                ? request.parcel().length()
                : DEFAULT_CONFIG.parcelDefaults().length();
        int width = request.parcel() != null && request.parcel().width() != null
                ? request.parcel().width()
                : DEFAULT_CONFIG.parcelDefaults().width();
        int height = request.parcel() != null && request.parcel().height() != null
                ? request.parcel().height()
                : DEFAULT_CONFIG.parcelDefaults().height();
        BigDecimal insuranceValue = request.declaredValue() != null
                ? request.declaredValue()
                : deriveInsuranceValue(request.subtotal());

        try {
            GhnShippingService.CarrierQuote carrierQuote = ghnShippingService.quote(
                    address,
                    weight,
                    length,
                    width,
                    height,
                    insuranceValue
            );
            BigDecimal fee = applyFreeShip(carrierQuote.fee(), request.subtotal(), address.provinceCode());
            return new ShippingQuoteResponse(
                    "quoted",
                    "carrier_api",
                    null,
                    fee,
                    new ShippingQuoteResponse.EtaDaysDto(carrierQuote.etaDays().min(), carrierQuote.etaDays().max()),
                    null,
                    isFreeShip(request.subtotal(), address.provinceCode()),
                    null,
                    null,
                    carrierQuote.latencyMs(),
                    Instant.now().toString()
            );
        } catch (GhnShippingService.CarrierFailure failure) {
            ShippingQuoteResponse fallback = fallbackQuote(request, failure.reason(), failure.latencyMs());
            if (fallback != null) {
                return fallback;
            }
            return new ShippingQuoteResponse(
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

    private ShippingQuoteResponse fallbackQuote(ShippingQuoteRequest request, String reason, long latencyMs) {
        ZoneRule rule = pickZone(request.address().provinceCode());
        if (rule == null) {
            return null;
        }
        int weight = request.weightGrams() != null ? request.weightGrams() : DEFAULT_CONFIG.parcelDefaults().weightGrams();
        int surcharge = Math.max(0, (int) Math.ceil((weight - 1000) / 500.0)) * 3000;
        BigDecimal fee = BigDecimal.valueOf(rule.baseFee() + surcharge);
        boolean freeShipApplied = isFreeShip(request.subtotal(), request.address().provinceCode());
        if (freeShipApplied) {
            fee = BigDecimal.ZERO;
        }
        return new ShippingQuoteResponse(
                "quoted",
                "zone_fallback",
                rule.zoneCode(),
                fee,
                new ShippingQuoteResponse.EtaDaysDto(rule.etaDays().min(), rule.etaDays().max()),
                null,
                freeShipApplied,
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

    private BigDecimal deriveInsuranceValue(BigDecimal subtotal) {
        String mode = DEFAULT_CONFIG.parcelDefaults().declaredValueMode();
        if ("subtotal".equals(mode)) {
            return subtotal.min(BigDecimal.valueOf(5_000_000L));
        }
        if ("fixed".equals(mode) && DEFAULT_CONFIG.parcelDefaults().declaredValueFixed() != null) {
            return DEFAULT_CONFIG.parcelDefaults().declaredValueFixed().min(BigDecimal.valueOf(5_000_000L));
        }
        return BigDecimal.ZERO;
    }

    private BigDecimal applyFreeShip(BigDecimal fee, BigDecimal subtotal, String provinceCode) {
        return isFreeShip(subtotal, provinceCode) ? BigDecimal.ZERO : fee.setScale(0, RoundingMode.HALF_UP);
    }

    private boolean isFreeShip(BigDecimal subtotal, String provinceCode) {
        ZoneRule zone = pickZone(provinceCode);
        return zone != null && zone.freeShipThreshold() != null
                && subtotal.compareTo(BigDecimal.valueOf(zone.freeShipThreshold())) >= 0;
    }

    private ZoneRule pickZone(String provinceCode) {
        ZoneRule direct = DEFAULT_CONFIG.zoneRules().stream()
                .filter(rule -> rule.provinceCodes().contains(provinceCode))
                .findFirst()
                .orElse(null);
        if (direct != null) {
            return direct;
        }
        return DEFAULT_CONFIG.zoneRules().stream()
                .filter(rule -> rule.provinceCodes().contains("*"))
                .findFirst()
                .orElse(null);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private record ShippingConfig(List<ZoneRule> zoneRules, ParcelDefaults parcelDefaults) {}
    private record ZoneRule(String zoneCode, int baseFee, Integer freeShipThreshold, EtaDays etaDays, List<String> provinceCodes) {}
    private record EtaDays(int min, int max) {}
    private record ParcelDefaults(int length, int width, int height, int weightGrams, String declaredValueMode, BigDecimal declaredValueFixed) {}
}
