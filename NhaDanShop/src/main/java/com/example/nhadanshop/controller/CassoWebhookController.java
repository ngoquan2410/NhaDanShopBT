package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.CassoWebhookResponse;
import com.example.nhadanshop.service.IdempotencyScopes;
import com.example.nhadanshop.service.IdempotencyService;
import com.example.nhadanshop.service.PaymentEventService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@RestController
@RequestMapping("/api/webhooks")
@RequiredArgsConstructor
public class CassoWebhookController {

    private final PaymentEventService paymentEventService;
    private final IdempotencyService idempotencyService;
    private final ObjectMapper objectMapper;

    @PostMapping("/casso")
    public ResponseEntity<CassoWebhookResponse> ingest(
            @RequestBody String rawBody,
            @RequestHeader(value = "X-Casso-Signature", required = false) String signatureHeader,
            @RequestHeader(value = "secure-token", required = false) String secureTokenHeader) throws Exception {
        JsonNode root = objectMapper.readTree(rawBody);
        String scopeRef = root.path("data").path("reference").asText(
                root.path("data").path("id").asText("batch"));
        String idempotencyKey = sha256(rawBody);

        PaymentEventService.CassoIngestResult result = idempotencyService.execute(
                IdempotencyScopes.cassoWebhook(scopeRef),
                idempotencyKey,
                PaymentEventService.CassoIngestResult.class,
                () -> paymentEventService.ingestCassoPayload(root, signatureHeader, secureTokenHeader));

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(new CassoWebhookResponse(
                result.received(),
                result.upserted(),
                result.autoLinked(),
                result.markedPaidAuto()
        ));
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder builder = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                builder.append(String.format("%02x", b));
            }
            return builder.toString();
        } catch (Exception ex) {
            throw new IllegalStateException("Không thể tạo idempotency key cho webhook", ex);
        }
    }
}
