package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ShippingParcelDefaultsDto;
import com.example.nhadanshop.dto.ShippingLocalRuleDto;
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
            List.of(defaultMoCayLocalRule()),
            new ShippingParcelDefaultsDto(10, 10, 10, 500, "none", null)
    );

    /** Same structure ShippingQuoteService used to hardcode; public for quote path. */
    public record ResolvedShippingQuoteConfig(
            List<ResolvedZoneRule> zoneRules,
            List<ResolvedLocalRule> localRules,
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
                    dto.localRules() == null ? List.of() : dto.localRules().stream()
                            .map(r -> new ResolvedLocalRule(
                                    r.enabled(),
                                    r.zoneCode(),
                                    r.label(),
                                    r.fee(),
                                    new EtaDays(r.etaDays().min(), r.etaDays().max()),
                                    safeList(r.provinceCodes()),
                                    safeList(r.provinceNames()),
                                    safeList(r.districtCodes()),
                                    safeList(r.districtNames()),
                                    safeList(r.wardCodes()),
                                    safeList(r.wardNames())
                            ))
                            .toList(),
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

    public record ResolvedLocalRule(
            boolean enabled,
            String zoneCode,
            String label,
            int fee,
            EtaDays etaDays,
            List<String> provinceCodes,
            List<String> provinceNames,
            List<String> districtCodes,
            List<String> districtNames,
            List<String> wardCodes,
            List<String> wardNames
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
            record.setLocalRulesJson(objectMapper.writeValueAsString(normalized.localRules()));
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
        List<ShippingLocalRuleDto> localRules = input.localRules() == null ? List.of() : input.localRules().stream()
                .map(this::normalizeLocalRule)
                .toList();
        return new ShippingSettingsDto(input.zoneRules(), localRules, parcel);
    }

    private ShippingLocalRuleDto normalizeLocalRule(ShippingLocalRuleDto r) {
        if (r.etaDays().min() > r.etaDays().max()) {
            throw new IllegalArgumentException("Local rule " + r.zoneCode() + ": ETA min must be <= max");
        }
        List<String> provinceCodes = safeList(r.provinceCodes());
        List<String> provinceNames = safeList(r.provinceNames());
        List<String> districtCodes = safeList(r.districtCodes());
        List<String> districtNames = safeList(r.districtNames());
        List<String> wardCodes = safeList(r.wardCodes());
        List<String> wardNames = safeList(r.wardNames());
        if (r.enabled()) {
            requireLocalMatcher(r.zoneCode(), "province", provinceCodes, provinceNames);
            requireLocalMatcher(r.zoneCode(), "district", districtCodes, districtNames);
            requireLocalMatcher(r.zoneCode(), "ward", wardCodes, wardNames);
        }
        return new ShippingLocalRuleDto(
                r.enabled(),
                r.zoneCode().trim(),
                r.label().trim(),
                r.fee(),
                r.etaDays(),
                provinceCodes,
                provinceNames,
                districtCodes,
                districtNames,
                wardCodes,
                wardNames
        );
    }

    private void requireLocalMatcher(String zoneCode, String dimension, List<String> codes, List<String> names) {
        if (codes.isEmpty() && names.isEmpty()) {
            throw new IllegalArgumentException("Local rule " + zoneCode + ": enabled rule must include " + dimension + " code or name matcher");
        }
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
            List<ShippingLocalRuleDto> localRules = record.getLocalRulesJson() == null || record.getLocalRulesJson().isBlank()
                    ? List.of()
                    : objectMapper.readValue(record.getLocalRulesJson(), new TypeReference<>() {});
            return normalize(new ShippingSettingsDto(zones, localRules, parcel));
        } catch (Exception e) {
            throw new IllegalStateException("Invalid shipping_settings row", e);
        }
    }

    private ResolvedShippingQuoteConfig toResolved(ShippingSettingsRecord record) {
        return ResolvedShippingQuoteConfig.fromDto(toDto(record));
    }

    private static ShippingLocalRuleDto defaultMoCayLocalRule() {
        return new ShippingLocalRuleDto(
                true,
                "LOCAL_MO_CAY",
                "Mỏ Cày local delivery",
                0,
                new ShippingZoneRuleDto.EtaDaysDto(1, 1),
                List.of("83", "86"),
                List.of("Bến Tre", "Vĩnh Long"),
                List.of(),
                List.of("Mỏ Cày", "Mỏ Cày Nam", "Huyện Mỏ Cày Nam"),
                List.of(),
                List.of("Mỏ Cày", "Thị trấn Mỏ Cày")
        );
    }

    private static List<String> safeList(List<String> input) {
        if (input == null) {
            return List.of();
        }
        return input.stream()
                .filter(v -> v != null && !v.isBlank())
                .map(String::trim)
                .distinct()
                .toList();
    }
}
