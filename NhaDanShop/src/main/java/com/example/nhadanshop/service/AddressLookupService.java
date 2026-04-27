package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.AddressDistrictDto;
import com.example.nhadanshop.dto.AddressProvinceDto;
import com.example.nhadanshop.dto.AddressWardDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.text.Collator;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;
import java.util.stream.StreamSupport;

@Service
@RequiredArgsConstructor
public class AddressLookupService {

    private static final String BASE_URL = "https://provinces.open-api.vn/api";
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(6);
    private static final long CACHE_TTL_MS = 24 * 60 * 60 * 1000L;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();
    private final Map<String, CacheEntry<?>> cache = new ConcurrentHashMap<>();
    private final Collator viCollator = Collator.getInstance(Locale.forLanguageTag("vi-VN"));

    public List<AddressProvinceDto> listProvinces() {
        return getCached("provinces", this::fetchProvinces);
    }

    public List<AddressDistrictDto> listDistricts(String provinceCode) {
        String normalized = requireCode(provinceCode, "provinceCode");
        return getCached("districts:" + normalized, () -> fetchDistricts(normalized));
    }

    public List<AddressWardDto> listWards(String districtCode) {
        String normalized = requireCode(districtCode, "districtCode");
        return getCached("wards:" + normalized, () -> fetchWards(normalized));
    }

    private List<AddressProvinceDto> fetchProvinces() {
        JsonNode root = fetchJson("%s/p/".formatted(BASE_URL));
        if (!root.isArray()) {
            throw upstreamFormatError("Invalid provinces payload");
        }
        return sortProvinces(root);
    }

    private List<AddressDistrictDto> fetchDistricts(String provinceCode) {
        JsonNode root = fetchJson("%s/p/%s?depth=2".formatted(BASE_URL, encodeSegment(provinceCode)));
        JsonNode districts = root.path("districts");
        if (!districts.isArray()) {
            return List.of();
        }
        return sortDistricts(districts, provinceCode);
    }

    private List<AddressWardDto> fetchWards(String districtCode) {
        JsonNode root = fetchJson("%s/d/%s?depth=2".formatted(BASE_URL, encodeSegment(districtCode)));
        JsonNode wards = root.path("wards");
        if (!wards.isArray()) {
            return List.of();
        }
        return sortWards(wards, districtCode);
    }

    private JsonNode fetchJson(String url) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(REQUEST_TIMEOUT)
                .GET()
                .header("Accept", "application/json")
                .build();
        try {
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Address provider returned HTTP " + response.statusCode() + " for " + url);
            }
            return objectMapper.readTree(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Address lookup interrupted", e);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Address lookup failed", e);
        }
    }

    private List<AddressProvinceDto> sortProvinces(JsonNode provinces) {
        return toStream(provinces).stream()
                .map(node -> new AddressProvinceDto(node.path("code").asText(), node.path("name").asText("")))
                .sorted((left, right) -> viCollator.compare(left.name(), right.name()))
                .toList();
    }

    private List<AddressDistrictDto> sortDistricts(JsonNode districts, String provinceCode) {
        return toStream(districts).stream()
                .map(node -> new AddressDistrictDto(
                        node.path("code").asText(),
                        node.path("name").asText(""),
                        provinceCode))
                .sorted((left, right) -> viCollator.compare(left.name(), right.name()))
                .toList();
    }

    private List<AddressWardDto> sortWards(JsonNode wards, String districtCode) {
        return toStream(wards).stream()
                .map(node -> new AddressWardDto(
                        node.path("code").asText(),
                        node.path("name").asText(""),
                        districtCode))
                .sorted((left, right) -> viCollator.compare(left.name(), right.name()))
                .toList();
    }

    private String requireCode(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing " + fieldName);
        }
        return value.trim();
    }

    private String encodeSegment(String raw) {
        return raw.replace(" ", "%20");
    }

    private ResponseStatusException upstreamFormatError(String message) {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, message);
    }

    @SuppressWarnings("unchecked")
    private <T> T getCached(String key, Supplier<T> loader) {
        CacheEntry<?> existing = cache.get(key);
        long now = System.currentTimeMillis();
        if (existing != null && existing.expiresAt() > now) {
            return (T) existing.value();
        }
        T value = loader.get();
        cache.put(key, new CacheEntry<>(value, now + CACHE_TTL_MS));
        return value;
    }

    private List<JsonNode> toStream(JsonNode arrayNode) {
        return arrayNode.isArray()
                ? StreamSupport.stream(arrayNode.spliterator(), false).toList()
                : List.of();
    }

    private record CacheEntry<T>(T value, long expiresAt) {}
}
