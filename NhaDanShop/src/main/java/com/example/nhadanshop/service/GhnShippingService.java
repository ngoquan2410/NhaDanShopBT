package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.ShippingAddressDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.text.Normalizer;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.StreamSupport;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
@RequiredArgsConstructor
public class GhnShippingService {

    // Operational hardening note:
    // - live quotes require ghn.token and ghn.shop-id to be configured
    // - HTTP timeouts are defined in this service (4s connect, 8s request)
    // - province/district/ward matching is still name-based and should be treated
    //   as a robustness hotspot for ambiguous or partially normalized addresses
    private static final String GHN_BASE = "https://online-gateway.ghn.vn/shiip/public-api";
    private static final long CACHE_TTL_MS = 24 * 60 * 60 * 1000L;
    private static final long VN_UTC_OFFSET_MS = 7L * 60 * 60 * 1000;

    @Value("${ghn.token:}")
    private String ghnToken;

    @Value("${ghn.shop-id:}")
    private String ghnShopId;

    @Value("${ghn.from-district-id:}")
    private String ghnFromDistrictId;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .build();
    private volatile CacheEntry<List<Province>> provinceCache;
    private final Map<Integer, CacheEntry<List<District>>> districtCache = new ConcurrentHashMap<>();
    private final Map<Integer, CacheEntry<List<Ward>>> wardCache = new ConcurrentHashMap<>();

    public CarrierQuote quote(
            ShippingAddressDto address,
            Integer weightGrams,
            Integer length,
            Integer width,
            Integer height,
            BigDecimal insuranceValue
    ) {
        long startedAt = System.currentTimeMillis();
        String provinceName = trim(address.provinceName());
        String districtName = trim(address.districtName());
        String wardName = trim(address.wardName());

        try {
            String token = requireConfigured(ghnToken, "GHN_TOKEN");
            int shopId = parseConfiguredInt(ghnShopId, "GHN_SHOP_ID");
            Integer fromDistrictId = parseOptionalConfiguredInt(ghnFromDistrictId);

            Province province = matchByName(getProvinces(token), provinceName, Province::name, Province::nameExtensions);
            if (province == null) {
                throw new CarrierFailure("address_unmapped", "Province \"" + provinceName + "\" not found in GHN", elapsed(startedAt));
            }

            District district = matchByName(getDistricts(token, province.id()), districtName, District::name, District::nameExtensions);
            if (district == null) {
                throw new CarrierFailure("address_unmapped", "District \"" + districtName + "\" not found in GHN", elapsed(startedAt));
            }

            Ward ward = matchByName(getWards(token, district.id()), wardName, Ward::name, Ward::nameExtensions);
            if (ward == null) {
                throw new CarrierFailure("address_unmapped", "Ward \"" + wardName + "\" not found in GHN", elapsed(startedAt));
            }

            Integer serviceId = null;
            int serviceTypeId = 2;
            if (fromDistrictId != null) {
                List<ServiceOption> services = getAvailableServices(token, shopId, fromDistrictId, district.id());
                if (services.isEmpty()) {
                    throw new CarrierFailure("no_service", "No GHN service available for this route", elapsed(startedAt));
                }
                ServiceOption selected = services.stream()
                        .filter(s -> s.serviceTypeId() == 2)
                        .findFirst()
                        .orElse(services.get(0));
                serviceId = selected.serviceId();
                serviceTypeId = selected.serviceTypeId();
            }

            FeeQuote feeQuote = getFee(
                    token,
                    shopId,
                    fromDistrictId,
                    district.id(),
                    ward.code(),
                    weightGrams != null ? weightGrams : 500,
                    length != null ? length : 10,
                    width != null ? width : 10,
                    height != null ? height : 10,
                    insuranceValue != null ? insuranceValue : BigDecimal.ZERO,
                    serviceId,
                    serviceTypeId
            );

            int etaDays = getLeadtimeDays(token, shopId, fromDistrictId, district.id(), ward.code(), serviceId);

            return new CarrierQuote(
                    BigDecimal.valueOf(feeQuote.total()),
                    new EtaDays(etaDays, etaDays),
                    elapsed(startedAt)
            );
        } catch (CarrierFailure e) {
            throw e;
        } catch (HttpTimeoutException e) {
            throw new CarrierFailure("timeout", "GHN request timed out", elapsed(startedAt), e);
        } catch (IOException | InterruptedException e) {
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new CarrierFailure("ghn_error", e.getMessage() != null ? e.getMessage() : "GHN request failed", elapsed(startedAt), e);
        } catch (ResponseStatusException e) {
            throw new CarrierFailure("ghn_error", e.getReason() != null ? e.getReason() : "GHN request failed", elapsed(startedAt), e);
        }
    }

    private List<Province> getProvinces(String token) throws IOException, InterruptedException {
        CacheEntry<List<Province>> cached = provinceCache;
        if (isFresh(cached)) {
            return cached.value();
        }
        JsonNode data = ghnFetch("/master-data/province", token, null, null);
        List<Province> provinces = iterable(data).stream()
                .map(node -> new Province(
                        node.path("ProvinceID").asInt(),
                        node.path("ProvinceName").asText(""),
                        iterable(node.path("NameExtension")).stream().map(JsonNode::asText).toList()))
                .toList();
        provinceCache = new CacheEntry<>(provinces, System.currentTimeMillis());
        return provinces;
    }

    private List<District> getDistricts(String token, int provinceId) throws IOException, InterruptedException {
        CacheEntry<List<District>> cached = districtCache.get(provinceId);
        if (isFresh(cached)) {
            return cached.value();
        }
        JsonNode data = ghnFetch("/master-data/district", token, """
                {"province_id":%d}
                """.formatted(provinceId), null);
        List<District> districts = iterable(data).stream()
                .map(node -> new District(
                        node.path("DistrictID").asInt(),
                        node.path("DistrictName").asText(""),
                        iterable(node.path("NameExtension")).stream().map(JsonNode::asText).toList()))
                .toList();
        districtCache.put(provinceId, new CacheEntry<>(districts, System.currentTimeMillis()));
        return districts;
    }

    private List<Ward> getWards(String token, int districtId) throws IOException, InterruptedException {
        CacheEntry<List<Ward>> cached = wardCache.get(districtId);
        if (isFresh(cached)) {
            return cached.value();
        }
        JsonNode data = ghnFetch("/master-data/ward", token, """
                {"district_id":%d}
                """.formatted(districtId), null);
        List<Ward> wards = iterable(data).stream()
                .map(node -> new Ward(
                        node.path("WardCode").asText(""),
                        node.path("WardName").asText(""),
                        iterable(node.path("NameExtension")).stream().map(JsonNode::asText).toList()))
                .toList();
        wardCache.put(districtId, new CacheEntry<>(wards, System.currentTimeMillis()));
        return wards;
    }

    private List<ServiceOption> getAvailableServices(String token, int shopId, int fromDistrictId, int toDistrictId)
            throws IOException, InterruptedException {
        JsonNode data = ghnFetch(
                "/v2/shipping-order/available-services",
                token,
                """
                {"shop_id":%d,"from_district":%d,"to_district":%d}
                """.formatted(shopId, fromDistrictId, toDistrictId),
                null
        );
        return iterable(data).stream()
                .map(node -> new ServiceOption(
                        node.path("service_id").asInt(),
                        node.path("service_type_id").asInt()))
                .toList();
    }

    private FeeQuote getFee(
            String token,
            int shopId,
            Integer fromDistrictId,
            int toDistrictId,
            String wardCode,
            int weight,
            int length,
            int width,
            int height,
            BigDecimal insuranceValue,
            Integer serviceId,
            int serviceTypeId
    ) throws IOException, InterruptedException {
        StringBuilder body = new StringBuilder();
        body.append("{")
                .append("\"service_type_id\":").append(serviceTypeId).append(",")
                .append("\"to_district_id\":").append(toDistrictId).append(",")
                .append("\"to_ward_code\":\"").append(escapeJson(wardCode)).append("\",")
                .append("\"weight\":").append(weight).append(",")
                .append("\"length\":").append(length).append(",")
                .append("\"width\":").append(width).append(",")
                .append("\"height\":").append(height).append(",")
                .append("\"insurance_value\":").append(insuranceValue.setScale(0, RoundingMode.HALF_UP).toPlainString());
        if (serviceId != null) {
            body.append(",\"service_id\":").append(serviceId);
        }
        if (fromDistrictId != null) {
            body.append(",\"from_district_id\":").append(fromDistrictId);
        }
        body.append("}");

        JsonNode data = ghnFetch(
                "/v2/shipping-order/fee",
                token,
                body.toString(),
                Map.of("ShopId", String.valueOf(shopId))
        );
        return new FeeQuote(data.path("total").asLong());
    }

    private int getLeadtimeDays(
            String token,
            int shopId,
            Integer fromDistrictId,
            int toDistrictId,
            String wardCode,
            Integer serviceId
    ) {
        try {
            StringBuilder body = new StringBuilder();
            body.append("{")
                    .append("\"to_district_id\":").append(toDistrictId).append(",")
                    .append("\"to_ward_code\":\"").append(escapeJson(wardCode)).append("\",")
                    .append("\"service_id\":").append(serviceId != null ? serviceId : 0);
            if (fromDistrictId != null) {
                body.append(",\"from_district_id\":").append(fromDistrictId);
            }
            body.append("}");

            JsonNode data = ghnFetch(
                    "/v2/shipping-order/leadtime",
                    token,
                    body.toString(),
                    Map.of("ShopId", String.valueOf(shopId))
            );
            long leadtimeSeconds = data.path("leadtime").asLong(0);
            if (leadtimeSeconds <= 0) {
                return 2;
            }
            long todayBucket = Math.floorDiv(System.currentTimeMillis() + VN_UTC_OFFSET_MS, 86_400_000L);
            long targetBucket = Math.floorDiv(leadtimeSeconds * 1000L + VN_UTC_OFFSET_MS, 86_400_000L);
            return Math.max(1, (int) (targetBucket - todayBucket));
        } catch (Exception ignored) {
            return 2;
        }
    }

    private JsonNode ghnFetch(String path, String token, String body, Map<String, String> extraHeaders)
            throws IOException, InterruptedException {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(GHN_BASE + path))
                .timeout(Duration.ofSeconds(8))
                .header("Token", token)
                .header("Content-Type", "application/json");
        if (extraHeaders != null) {
            extraHeaders.forEach(builder::header);
        }
        if (body == null) {
            builder.GET();
        } else {
            builder.POST(HttpRequest.BodyPublishers.ofString(body));
        }
        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        JsonNode root = objectMapper.readTree(response.body());
        if (response.statusCode() < 200 || response.statusCode() >= 300 || root.path("code").asInt() != 200) {
            String message = root.path("message").asText(response.statusCode() + " " + path);
            if (path.contains("/fee")) {
                throw new CarrierFailure("ghn_error", message, 0);
            }
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, message);
        }
        return root.path("data");
    }

    private String requireConfigured(String value, String keyName) {
        if (value == null || value.isBlank()) {
            throw new CarrierFailure("no_config", keyName + " not configured", 0);
        }
        return value.trim();
    }

    private int parseConfiguredInt(String value, String keyName) {
        String normalized = requireConfigured(value, keyName).replaceAll("\\D", "");
        if (normalized.isBlank()) {
            throw new CarrierFailure("no_config", keyName + " must be numeric", 0);
        }
        return Integer.parseInt(normalized);
    }

    private Integer parseOptionalConfiguredInt(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.replaceAll("\\D", "");
        return normalized.isBlank() ? null : Integer.parseInt(normalized);
    }

    private <T> T matchByName(List<T> items, String target, NameGetter<T> getName, ExtensionGetter<T> getExtensions) {
        String normalizedTarget = normalize(target);
        for (T item : items) {
            if (normalize(getName.get(item)).equals(normalizedTarget)) {
                return item;
            }
            List<String> extensions = getExtensions.get(item);
            if (extensions != null && extensions.stream().map(this::normalize).anyMatch(normalizedTarget::equals)) {
                return item;
            }
        }
        for (T item : items) {
            String normalizedName = normalize(getName.get(item));
            if (normalizedName.contains(normalizedTarget) || normalizedTarget.contains(normalizedName)) {
                return item;
            }
            List<String> extensions = getExtensions.get(item);
            if (extensions != null && extensions.stream().map(this::normalize)
                    .anyMatch(ext -> ext.contains(normalizedTarget) || normalizedTarget.contains(ext))) {
                return item;
            }
        }
        return null;
    }

    private String normalize(String value) {
        String base = value == null ? "" : value.trim().toLowerCase();
        String noDiacritics = Normalizer.normalize(base, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "")
                .replace("đ", "d");
        return noDiacritics
                .replaceFirst("^(tinh|thanh pho|tp\\.?|quan|huyen|thi xa|phuong|xa|thi tran)\\s+", "")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private List<JsonNode> iterable(JsonNode arrayNode) {
        if (arrayNode == null || !arrayNode.isArray()) {
            return List.of();
        }
        return StreamSupport.stream(arrayNode.spliterator(), false).toList();
    }

    private long elapsed(long startedAt) {
        return System.currentTimeMillis() - startedAt;
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean isFresh(CacheEntry<?> entry) {
        return entry != null && System.currentTimeMillis() - entry.at() < CACHE_TTL_MS;
    }

    private String escapeJson(String value) {
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private interface NameGetter<T> {
        String get(T value);
    }

    private interface ExtensionGetter<T> {
        List<String> get(T value);
    }

    public record CarrierQuote(
            BigDecimal fee,
            EtaDays etaDays,
            long latencyMs
    ) {}

    public record EtaDays(int min, int max) {}

    public static class CarrierFailure extends RuntimeException {
        private final String reason;
        private final long latencyMs;

        public CarrierFailure(String reason, String message, long latencyMs) {
            super(message);
            this.reason = reason;
            this.latencyMs = latencyMs;
        }

        public CarrierFailure(String reason, String message, long latencyMs, Throwable cause) {
            super(message, cause);
            this.reason = reason;
            this.latencyMs = latencyMs;
        }

        public String reason() {
            return reason;
        }

        public long latencyMs() {
            return latencyMs;
        }
    }

    private record Province(int id, String name, List<String> nameExtensions) {}
    private record District(int id, String name, List<String> nameExtensions) {}
    private record Ward(String code, String name, List<String> nameExtensions) {}
    private record ServiceOption(int serviceId, int serviceTypeId) {}
    private record FeeQuote(long total) {}
    private record CacheEntry<T>(T value, long at) {}

}
