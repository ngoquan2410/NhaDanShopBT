package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.AddressAutocompleteResponse;
import com.example.nhadanshop.dto.AddressPlaceDetailResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.StreamSupport;

@Service
@RequiredArgsConstructor
public class GoongAddressService {

    // Transitional hardening note:
    // - cache and soft quota counters are process-local / in-memory only
    // - values reset on restart and are not shared across multiple instances
    // - this is acceptable for now but should not be treated as durable quota control
    // - production multi-instance deployments should move these concerns to shared storage
    private static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(8);
    private static final long AUTOCOMPLETE_TTL_MS = 10 * 60 * 1000L;
    private static final long DETAIL_TTL_MS = 60 * 60 * 1000L;

    @Value("${goong.rest-api-key:}")
    private String goongRestApiKey;

    @Value("${goong.daily-soft-cap:800}")
    private int dailySoftCap;

    @Value("${goong.monthly-soft-cap:20000}")
    private int monthlySoftCap;

    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(4))
            .build();
    private final Map<String, CacheEntry<AddressAutocompleteResponse>> autocompleteCache = new ConcurrentHashMap<>();
    private final Map<String, CacheEntry<AddressPlaceDetailResponse>> detailCache = new ConcurrentHashMap<>();
    private final AtomicInteger dailyUsage = new AtomicInteger(0);
    private final AtomicInteger monthlyUsage = new AtomicInteger(0);
    private volatile LocalDate currentDay = LocalDate.now(ZoneOffset.UTC);
    private volatile YearMonth currentMonth = YearMonth.now(ZoneOffset.UTC);

    public AddressAutocompleteResponse autocomplete(String input, boolean dryRun) {
        String normalizedInput = normalizeInput(input);
        if (normalizedInput.length() < 4) {
            return new AddressAutocompleteResponse(false, List.of(), dryRun ? Boolean.TRUE : null, dryRun ? Boolean.FALSE : null);
        }

        CacheEntry<AddressAutocompleteResponse> cached = readCache(autocompleteCache, normalizedInput);
        if (cached != null) {
            return new AddressAutocompleteResponse(
                    cached.value().quotaExceeded(),
                    cached.value().predictions(),
                    dryRun ? Boolean.TRUE : null,
                    Boolean.TRUE);
        }

        if (quotaExceeded()) {
            return new AddressAutocompleteResponse(Boolean.TRUE, List.of(), null, null);
        }
        if (dryRun) {
            return new AddressAutocompleteResponse(Boolean.FALSE, List.of(), Boolean.TRUE, Boolean.FALSE);
        }
        ensureConfigured();

        String url = "https://rsapi.goong.io/v2/place/autocomplete?input=%s&api_key=%s&limit=5".formatted(
                encode(normalizedInput),
                encode(goongRestApiKey));

        JsonNode root = fetchJson(url);
        JsonNode predictions = root.path("predictions");
        if (!predictions.isArray()) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Invalid autocomplete payload");
        }
        List<AddressAutocompleteResponse.Prediction> mapped = StreamSupport.stream(predictions.spliterator(), false)
                .limit(5)
                .map(node -> new AddressAutocompleteResponse.Prediction(
                        text(node, "place_id"),
                        text(node, "description"),
                        structuredFormatting(node.path("structured_formatting"))))
                .toList();
        AddressAutocompleteResponse response = new AddressAutocompleteResponse(Boolean.FALSE, mapped, null, null);
        autocompleteCache.put(normalizedInput, new CacheEntry<>(response, System.currentTimeMillis() + AUTOCOMPLETE_TTL_MS));
        return response;
    }

    public AddressPlaceDetailResponse placeDetail(String placeId, boolean dryRun) {
        String normalizedPlaceId = requireValue(placeId, "placeId");
        CacheEntry<AddressPlaceDetailResponse> cached = readCache(detailCache, normalizedPlaceId);
        if (cached != null) {
            return new AddressPlaceDetailResponse(
                    cached.value().quotaExceeded(),
                    cached.value().result(),
                    dryRun ? Boolean.TRUE : null,
                    Boolean.TRUE);
        }

        if (quotaExceeded()) {
            return new AddressPlaceDetailResponse(Boolean.TRUE, null, null, null);
        }
        if (dryRun) {
            return new AddressPlaceDetailResponse(Boolean.FALSE, null, Boolean.TRUE, Boolean.FALSE);
        }
        ensureConfigured();

        String url = "https://rsapi.goong.io/Place/Detail?place_id=%s&api_key=%s".formatted(
                encode(normalizedPlaceId),
                encode(goongRestApiKey));

        JsonNode root = fetchJson(url);
        JsonNode resultNode = root.path("result");
        if (resultNode.isMissingNode() || resultNode.isNull()) {
            JsonNode firstResult = root.path("results");
            if (firstResult.isArray() && !firstResult.isEmpty()) {
                resultNode = firstResult.get(0);
            }
        }
        AddressPlaceDetailResponse.Result mapped = resultNode == null || resultNode.isMissingNode() || resultNode.isNull()
                ? null
                : new AddressPlaceDetailResponse.Result(
                text(resultNode, "place_id"),
                text(resultNode, "formatted_address"),
                text(resultNode, "name"),
                compound(resultNode.path("compound")),
                geometry(resultNode.path("geometry")),
                resultNode.path("address_components").isMissingNode() ? null : resultNode.path("address_components"));
        AddressPlaceDetailResponse response = new AddressPlaceDetailResponse(Boolean.FALSE, mapped, null, null);
        detailCache.put(normalizedPlaceId, new CacheEntry<>(response, System.currentTimeMillis() + DETAIL_TTL_MS));
        return response;
    }

    private JsonNode fetchJson(String url) {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .timeout(REQUEST_TIMEOUT)
                .GET()
                .header("Accept", "application/json")
                .build();
        try {
            bumpUsage();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            String body = response.body() == null ? "" : response.body();
            if (response.statusCode() == 429 || body.toLowerCase().contains("quota") || body.toLowerCase().contains("limit")) {
                throw new QuotaExceededException();
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "Goong provider returned HTTP " + response.statusCode());
            }
            return objectMapper.readTree(body);
        } catch (QuotaExceededException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Goong lookup interrupted", e);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Goong lookup failed", e);
        }
    }

    private void ensureConfigured() {
        if (goongRestApiKey == null || goongRestApiKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "GOONG_REST_API_KEY not configured");
        }
    }

    private String normalizeInput(String input) {
        return input == null ? "" : input.trim().replaceAll("\\s+", " ");
    }

    private String requireValue(String value, String fieldName) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing " + fieldName);
        }
        return value.trim();
    }

    private boolean quotaExceeded() {
        rollUsageWindow();
        return dailyUsage.get() >= dailySoftCap || monthlyUsage.get() >= monthlySoftCap;
    }

    private void bumpUsage() {
        rollUsageWindow();
        dailyUsage.incrementAndGet();
        monthlyUsage.incrementAndGet();
    }

    private synchronized void rollUsageWindow() {
        LocalDate nowDay = LocalDate.now(ZoneOffset.UTC);
        YearMonth nowMonth = YearMonth.now(ZoneOffset.UTC);
        if (!currentDay.equals(nowDay)) {
            currentDay = nowDay;
            dailyUsage.set(0);
        }
        if (!currentMonth.equals(nowMonth)) {
            currentMonth = nowMonth;
            monthlyUsage.set(0);
        }
    }

    private AddressAutocompleteResponse.StructuredFormatting structuredFormatting(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        return new AddressAutocompleteResponse.StructuredFormatting(
                text(node, "main_text"),
                text(node, "secondary_text"));
    }

    private AddressPlaceDetailResponse.Compound compound(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        return new AddressPlaceDetailResponse.Compound(
                text(node, "province"),
                text(node, "district"),
                text(node, "commune"));
    }

    private AddressPlaceDetailResponse.Geometry geometry(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        JsonNode location = node.path("location");
        if (location.isMissingNode() || location.isNull()) {
            return new AddressPlaceDetailResponse.Geometry(null);
        }
        return new AddressPlaceDetailResponse.Geometry(new AddressPlaceDetailResponse.Location(
                location.path("lat").isNumber() ? location.path("lat").asDouble() : null,
                location.path("lng").isNumber() ? location.path("lng").asDouble() : null));
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode field = node.path(fieldName);
        return field.isMissingNode() || field.isNull() ? null : field.asText();
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private <T> CacheEntry<T> readCache(Map<String, CacheEntry<T>> cacheMap, String key) {
        CacheEntry<T> entry = cacheMap.get(key);
        if (entry == null) {
            return null;
        }
        if (entry.expiresAt() <= System.currentTimeMillis()) {
            cacheMap.remove(key);
            return null;
        }
        return entry;
    }

    private record CacheEntry<T>(T value, long expiresAt) {}

    private static class QuotaExceededException extends ResponseStatusException {
        private QuotaExceededException() {
            super(HttpStatus.TOO_MANY_REQUESTS, "Goong quota exceeded");
        }
    }
}
