package com.example.nhadanshop.service;

import com.example.nhadanshop.entity.IdempotencyKeyRecord;
import com.example.nhadanshop.repository.IdempotencyKeyRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;
import java.util.function.Supplier;

/**
 * CRIT-008: khi client gửi {@link IdempotencyScopes#HEADER_NAME}, cùng user + scope + key
 * chỉ thực thi side-effect một lần; lần sau trả đúng body đã lưu (retry an toàn).
 */
@Service
@RequiredArgsConstructor
public class IdempotencyService {

    private final IdempotencyKeyRepository repo;
    private final ObjectMapper objectMapper;

    @Transactional
    public <T> T execute(String scope, String rawKey, Class<T> responseType, Supplier<T> action) {
        if (rawKey == null || rawKey.isBlank()) {
            return action.get();
        }
        String key = rawKey.trim();
        if (key.length() > 255) {
            throw new IllegalArgumentException("Idempotency-Key tối đa 255 ký tự");
        }
        String user = currentUserRef();

        Optional<IdempotencyKeyRecord> existing = repo.findByUserRefAndScopeAndIdempotencyKeyForUpdate(user, scope, key);
        if (existing.isPresent()) {
            IdempotencyKeyRecord row = existing.get();
            if (row.getStatus() == IdempotencyKeyRecord.Status.COMPLETED) {
                return readJson(row.getResponseJson(), responseType);
            }
            throw new IllegalStateException(
                    "Idempotency-Key trùng — yêu cầu trước vẫn đang xử lý. Vui lòng thử lại sau vài giây.");
        }

        IdempotencyKeyRecord inflight = new IdempotencyKeyRecord();
        inflight.setUserRef(user);
        inflight.setScope(scope);
        inflight.setIdempotencyKey(key);
        inflight.setStatus(IdempotencyKeyRecord.Status.IN_FLIGHT);
        repo.save(inflight);
        repo.flush();

        try {
            T result = action.get();
            inflight.setStatus(IdempotencyKeyRecord.Status.COMPLETED);
            inflight.setResponseJson(objectMapper.writeValueAsString(result));
            repo.save(inflight);
            return result;
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không thể lưu kết quả idempotent (JSON)", e);
        }
    }

    /**
     * Thao tác void (204). Lần lặp lại với cùng key → không chạy lại {@code action}.
     */
    @Transactional
    public void executeVoid(String scope, String rawKey, Runnable action) {
        if (rawKey == null || rawKey.isBlank()) {
            action.run();
            return;
        }
        String key = rawKey.trim();
        if (key.length() > 255) {
            throw new IllegalArgumentException("Idempotency-Key tối đa 255 ký tự");
        }
        String user = currentUserRef();

        Optional<IdempotencyKeyRecord> existing = repo.findByUserRefAndScopeAndIdempotencyKeyForUpdate(user, scope, key);
        if (existing.isPresent()) {
            IdempotencyKeyRecord row = existing.get();
            if (row.getStatus() == IdempotencyKeyRecord.Status.COMPLETED) {
                return;
            }
            throw new IllegalStateException(
                    "Idempotency-Key trùng — yêu cầu trước vẫn đang xử lý. Vui lòng thử lại sau vài giây.");
        }

        IdempotencyKeyRecord inflight = new IdempotencyKeyRecord();
        inflight.setUserRef(user);
        inflight.setScope(scope);
        inflight.setIdempotencyKey(key);
        inflight.setStatus(IdempotencyKeyRecord.Status.IN_FLIGHT);
        repo.save(inflight);
        repo.flush();

        action.run();
        inflight.setStatus(IdempotencyKeyRecord.Status.COMPLETED);
        inflight.setResponseJson(null);
        repo.save(inflight);
    }

    private <T> T readJson(String json, Class<T> responseType) {
        if (json == null || json.isBlank()) {
            throw new IllegalStateException("Bản ghi idempotent COMPLETED nhưng thiếu response_json");
        }
        try {
            return objectMapper.readValue(json, responseType);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Không thể đọc lại kết quả idempotent", e);
        }
    }

    private static String currentUserRef() {
        Authentication a = SecurityContextHolder.getContext().getAuthentication();
        if (a == null || !a.isAuthenticated()) {
            return "anonymous";
        }
        String name = a.getName();
        return name != null && !name.isBlank() ? name : "anonymous";
    }
}
