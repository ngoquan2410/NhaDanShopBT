package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ShippingParcelDefaultsDto;
import com.example.nhadanshop.dto.ShippingSettingsDto;
import com.example.nhadanshop.dto.ShippingZoneRuleDto;
import com.example.nhadanshop.entity.ShippingSettingsRecord;
import com.example.nhadanshop.repository.ShippingSettingsRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Persists admin shipping zone / parcel defaults and supplies {@link #resolveForQuote()} for {@link ShippingQuoteService}.
 */
@Service
@RequiredArgsConstructor
public class ShippingSettingsService {

    private final ShippingSettingsRepository repository;
    private final ObjectMapper objectMapper;

    private static final ShippingSettingsDto HARDCODED_DEFAULT = new ShippingSettingsDto(
            List.of(
                    new ShippingZoneRuleDto(
                            "Z1", "Nội thành HN / HCM", 18000, 200_000,
                            new ShippingZoneRuleDto.EtaDaysDto(1, 2),
                            List.of("01", "79")
                    ),
                    new ShippingZoneRuleDto(
                            "Z2", "Lân cận / Vùng kinh tế trọng điểm", 28000, 350_000,
                            new ShippingZoneRuleDto.EtaDaysDto(2, 3),
                            List.of("74", "75", "77", "80", "27", "33", "30", "26", "72", "31")
                    ),
                    new ShippingZoneRuleDto(
                            "Z3", "Toàn quốc còn lại", 38000, 500_000,
                            new ShippingZoneRuleDto.EtaDaysDto(3, 5),
                            List.of("*")
                    )
            ),
            new ShippingParcelDefaultsDto(10, 10, 10, 500, "none", null)
    );

    /** Same structure ShippingQuoteService used to hardcode; public for quote path. */
    public record ResolvedShippingQuoteConfig(
            List<ResolvedZoneRule> zoneRules,
            ResolvedParcelDefaults parcelDefaults
    ) {
        public static ResolvedShippingQuoteConfig fromHardcoded() {
            return fromDto(HARDCODED_DEFAULT);
        }

        static ResolvedShippingQuoteConfig fromDto(ShippingSettingsDto dto) {
            List<ResolvedZoneRule> rules = dto.zoneRules().stream()
                    .map(r -> new ResolvedZoneRule(
                            r.zoneCode(),
                            r.baseFee(),
                            r.freeShipThreshold(),
                            new EtaDays(r.etaDays().min(), r.etaDays().max()),
                            r.provinceCodes()
                    ))
                    .toList();
            ShippingParcelDefaultsDto p = dto.parcelDefaults();
            BigDecimal fixed = p.declaredValueFixed();
            return new ResolvedShippingQuoteConfig(
                    rules,
                    new ResolvedParcelDefaults(
                            p.length(), p.width(), p.height(), p.weightGrams(),
                            p.declaredValueMode(), fixed
                    )
            );
        }
    }

    public record ResolvedZoneRule(
            String zoneCode,
            int baseFee,
            Integer freeShipThreshold,
            EtaDays etaDays,
            List<String> provinceCodes
    ) {
    }

    public record EtaDays(int min, int max) {
    }

    public record ResolvedParcelDefaults(
            int length,
            int width,
            int height,
            int weightGrams,
            String declaredValueMode,
            BigDecimal declaredValueFixed
    ) {
    }

    public ShippingSettingsDto getSettings() {
        return repository.findById(ShippingSettingsRecord.SINGLETON_ID)
                .map(this::toDto)
                .orElse(HARDCODED_DEFAULT);
    }

    @Transactional
    public ShippingSettingsDto saveSettings(ShippingSettingsDto input) {
        ShippingSettingsDto normalized = normalize(input);
        ShippingSettingsRecord record = repository.findById(ShippingSettingsRecord.SINGLETON_ID)
                .orElseGet(() -> {
                    ShippingSettingsRecord r = new ShippingSettingsRecord();
                    r.setId(ShippingSettingsRecord.SINGLETON_ID);
                    return r;
                });
        try {
            record.setZoneRulesJson(objectMapper.writeValueAsString(normalized.zoneRules()));
            record.setParcelDefaultsJson(objectMapper.writeValueAsString(normalized.parcelDefaults()));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to serialize shipping settings", e);
        }
        record.setUpdatedAt(Instant.now());
        repository.save(record);
        return normalized;
    }

    public ResolvedShippingQuoteConfig resolveForQuote() {
        return repository.findById(ShippingSettingsRecord.SINGLETON_ID)
                .map(this::toResolved)
                .orElseGet(ResolvedShippingQuoteConfig::fromHardcoded);
    }

    private ShippingSettingsDto normalize(ShippingSettingsDto input) {
        ShippingParcelDefaultsDto p = input.parcelDefaults();
        boolean hasStar = input.zoneRules().stream().anyMatch(z -> z.provinceCodes().stream().anyMatch("*"::equals));
        if (!hasStar) {
            throw new IllegalArgumentException("At least one zone must include '*' as catch-all province code");
        }
        for (ShippingZoneRuleDto z : input.zoneRules()) {
            if (z.etaDays().min() > z.etaDays().max()) {
                throw new IllegalArgumentException("Zone " + z.zoneCode() + ": ETA min must be <= max");
            }
        }
        ShippingParcelDefaultsDto parcel = new ShippingParcelDefaultsDto(
                p.length(), p.width(), p.height(), p.weightGrams(),
                p.declaredValueMode(),
                "fixed".equals(p.declaredValueMode()) ? nullToZero(p.declaredValueFixed()) : null
        );
        return new ShippingSettingsDto(input.zoneRules(), parcel);
    }

    private static BigDecimal nullToZero(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private ShippingSettingsDto toDto(ShippingSettingsRecord record) {
        try {
            List<ShippingZoneRuleDto> zones = objectMapper.readValue(
                    record.getZoneRulesJson(),
                    new TypeReference<>() {
                    }
            );
            ShippingParcelDefaultsDto parcel = objectMapper.readValue(
                    record.getParcelDefaultsJson(),
                    ShippingParcelDefaultsDto.class
            );
            return normalize(new ShippingSettingsDto(zones, parcel));
        } catch (Exception e) {
            throw new IllegalStateException("Invalid shipping_settings row", e);
        }
    }

    private ResolvedShippingQuoteConfig toResolved(ShippingSettingsRecord record) {
        return ResolvedShippingQuoteConfig.fromDto(toDto(record));
    }
}
