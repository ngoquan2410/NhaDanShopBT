package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.PendingOrderResponse;
import com.example.nhadanshop.dto.PaymentEventLinkResponse;
import com.example.nhadanshop.dto.PaymentEventResponse;
import com.example.nhadanshop.entity.PaymentEvent;
import com.example.nhadanshop.entity.PendingOrder;
import com.example.nhadanshop.repository.PaymentEventRepository;
import com.example.nhadanshop.repository.PendingOrderRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.codec.Hex;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class PaymentEventService {

    private static final Pattern ORDER_CODE_PATTERN =
            Pattern.compile("\\bDH-\\d{8}-\\d{3,}\\b", Pattern.CASE_INSENSITIVE);
    private static final DateTimeFormatter CASSO_DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter CASSO_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final PaymentEventRepository paymentEventRepository;
    private final PendingOrderRepository pendingOrderRepository;
    private final PendingOrderService pendingOrderService;
    private final ObjectMapper objectMapper;

    @Value("${casso.webhook-secure-token:}")
    private String cassoWebhookSecureToken;

    @Value("${casso.webhook-checksum-key:}")
    private String cassoWebhookChecksumKey;

    @Transactional
    public List<PaymentEventResponse> listRecent(int limit) {
        return paymentEventRepository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, sanitizeLimit(limit, 50)))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public List<PaymentEventResponse> listUnmatched(int limit) {
        return paymentEventRepository.findWorklistUnmatched(PageRequest.of(0, sanitizeLimit(limit, 100)))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public List<PaymentEventResponse> listIgnored(int limit) {
        return paymentEventRepository.findByStatusOrderByCreatedAtDesc(
                        PaymentEvent.Status.IGNORED,
                        PageRequest.of(0, sanitizeLimit(limit, 100)))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public List<PaymentEventResponse> findByOrderCode(String code) {
        return paymentEventRepository.findByOrderCode(code, PageRequest.of(0, 20))
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public long countUnmatched() {
        return paymentEventRepository.countWorklistUnmatched();
    }

    @Transactional
    public PaymentEventLinkResponse linkToOrder(long eventId, String orderCode, String linkedBy) {
        PaymentEvent event = paymentEventRepository.findById(eventId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy giao dịch ID: " + eventId));
        PendingOrder order = pendingOrderRepository.findByOrderCodeOrPaymentReference(orderCode)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng mã: " + orderCode));

        attachEventToOrder(event, order, linkedBy);
        maybeMarkOrderPaidAuto(order, event.getAmount());

        paymentEventRepository.save(event);
        PendingOrderResponse pendingOrder = pendingOrderService.getById(order.getId());
        return new PaymentEventLinkResponse(toResponse(event), pendingOrder, false);
    }

    @Transactional
    public PaymentEventResponse markIgnored(long eventId) {
        PaymentEvent event = paymentEventRepository.findById(eventId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy giao dịch ID: " + eventId));
        event.setStatus(PaymentEvent.Status.IGNORED);
        return toResponse(paymentEventRepository.save(event));
    }

    @Transactional
    public PaymentEventResponse unmarkIgnored(long eventId) {
        PaymentEvent event = paymentEventRepository.findById(eventId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy giao dịch ID: " + eventId));
        if (event.getLinkedPendingOrder() != null) {
            event.setStatus(PaymentEvent.Status.LINKED);
        } else if (StringUtils.hasText(event.getMatchedCode())) {
            event.setStatus(PaymentEvent.Status.MATCHED);
        } else {
            event.setStatus(PaymentEvent.Status.UNMATCHED);
        }
        return toResponse(paymentEventRepository.save(event));
    }

    @Transactional
    public CassoIngestResult ingestCassoPayload(
            JsonNode root,
            String signatureHeader,
            String secureTokenHeader
    ) {
        validateWebhookAuth(root, signatureHeader, secureTokenHeader);

        List<JsonNode> rows = extractRows(root.path("data"));
        int upserted = 0;
        int autoLinked = 0;
        int markedPaidAuto = 0;
        for (JsonNode row : rows) {
            UpsertOutcome outcome = upsertCassoRow(row);
            if (outcome.upserted()) upserted++;
            if (outcome.autoLinked()) autoLinked++;
            if (outcome.markedPaidAuto()) markedPaidAuto++;
        }
        return new CassoIngestResult(rows.size(), upserted, autoLinked, markedPaidAuto);
    }

    private UpsertOutcome upsertCassoRow(JsonNode row) {
        String provider = "casso";
        String providerTxId = firstNonBlank(
                text(row, "reference"),
                text(row, "tid"),
                text(row, "id"));
        if (!StringUtils.hasText(providerTxId)) {
            return new UpsertOutcome(false, false, false);
        }

        PaymentEvent event = paymentEventRepository.findByProviderAndProviderTxId(provider, providerTxId)
                .orElseGet(PaymentEvent::new);
        event.setProvider(provider);
        event.setProviderTxId(providerTxId);
        event.setAmount(decimal(row, "amount"));
        event.setTransferContent(firstNonBlank(text(row, "description"), text(row, "content")));
        event.setBankAccount(firstNonBlank(text(row, "accountNumber"), text(row, "virtualAccountNumber")));
        event.setBankSubAcc(firstNonBlank(text(row, "bank_sub_acc_id"), text(row, "subAccId")));
        event.setTxTime(parseTimestamp(firstNonBlank(text(row, "transactionDateTime"), text(row, "when"))));
        event.setRawPayload(row.toString());

        String matchedCode = extractOrderCode(event.getTransferContent());
        event.setMatchedCode(matchedCode);

        if (event.getLinkedPendingOrder() == null && event.getStatus() != PaymentEvent.Status.IGNORED) {
            event.setStatus(StringUtils.hasText(matchedCode) ? PaymentEvent.Status.MATCHED : PaymentEvent.Status.UNMATCHED);
        }

        boolean autoLinked = false;
        boolean markedPaidAuto = false;
        if (StringUtils.hasText(matchedCode) && event.getLinkedPendingOrder() == null) {
            Optional<PendingOrder> matchedOrder = pendingOrderRepository.findByOrderCodeOrPaymentReference(matchedCode);
            if (matchedOrder.isPresent()) {
                attachEventToOrder(event, matchedOrder.get(), "auto");
                autoLinked = true;
                markedPaidAuto = maybeMarkOrderPaidAuto(matchedOrder.get(), event.getAmount());
            }
        } else if (event.getLinkedPendingOrder() != null) {
            markedPaidAuto = maybeMarkOrderPaidAuto(event.getLinkedPendingOrder(), event.getAmount());
        }

        paymentEventRepository.save(event);
        return new UpsertOutcome(true, autoLinked, markedPaidAuto);
    }

    private void attachEventToOrder(PaymentEvent event, PendingOrder order, String linkedBy) {
        event.setLinkedPendingOrder(order);
        event.setLinkedOrderCode(order.getOrderNo());
        event.setLinkedAt(LocalDateTime.now());
        event.setLinkedBy(linkedBy);
        event.setStatus(PaymentEvent.Status.LINKED);
    }

    private boolean maybeMarkOrderPaidAuto(PendingOrder order, BigDecimal amount) {
        if (amount == null || order == null || order.getStatus() == PendingOrder.Status.CONFIRMED
                || order.getStatus() == PendingOrder.Status.CANCELLED) {
            return false;
        }
        if (amount.compareTo(order.getTotalAmount()) < 0) {
            return false;
        }
        if (order.getStatus() != PendingOrder.Status.PAID_AUTO) {
            order.setStatus(PendingOrder.Status.PAID_AUTO);
            pendingOrderRepository.save(order);
            return true;
        }
        return false;
    }

    private void validateWebhookAuth(
            JsonNode dataNode,
            String signatureHeader,
            String secureTokenHeader
    ) {
        if (StringUtils.hasText(signatureHeader) && StringUtils.hasText(cassoWebhookChecksumKey)) {
            if (!verifySignature(dataNode, signatureHeader, cassoWebhookChecksumKey)) {
                throw new IllegalArgumentException("Chữ ký webhook Casso không hợp lệ");
            }
            return;
        }
        if (StringUtils.hasText(cassoWebhookSecureToken)) {
            if (!MessageDigest.isEqual(
                    cassoWebhookSecureToken.trim().getBytes(StandardCharsets.UTF_8),
                    firstNonBlank(secureTokenHeader, "").trim().getBytes(StandardCharsets.UTF_8))) {
                throw new IllegalArgumentException("secure-token Casso không hợp lệ");
            }
            return;
        }
        throw new IllegalStateException("Chưa cấu hình xác thực webhook Casso");
    }

    private boolean verifySignature(JsonNode dataNode, String header, String checksumKey) {
        String[] parts = header.split(",");
        String timestamp = null;
        String signature = null;
        for (String part : parts) {
            String trimmed = part.trim();
            if (trimmed.startsWith("t=")) timestamp = trimmed.substring(2);
            if (trimmed.startsWith("v1=")) signature = trimmed.substring(3);
        }
        if (!StringUtils.hasText(timestamp) || !StringUtils.hasText(signature)) {
            return false;
        }
        try {
            String normalizedJson = objectMapper.writeValueAsString(sortJson(dataNode));
            String signingPayload = timestamp + "." + normalizedJson;
            Mac mac = Mac.getInstance("HmacSHA512");
            mac.init(new SecretKeySpec(checksumKey.getBytes(StandardCharsets.UTF_8), "HmacSHA512"));
            String expected = new String(Hex.encode(mac.doFinal(signingPayload.getBytes(StandardCharsets.UTF_8))));
            return MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    signature.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            return false;
        }
    }

    private Object sortJson(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isArray()) {
            List<Object> values = new ArrayList<>();
            node.forEach(child -> values.add(sortJson(child)));
            return values;
        }
        if (node.isObject()) {
            LinkedHashMap<String, Object> sorted = new LinkedHashMap<>();
            List<java.util.Map.Entry<String, JsonNode>> entries = new ArrayList<>();
            node.fields().forEachRemaining(entries::add);
            entries.stream()
                    .sorted(java.util.Map.Entry.comparingByKey())
                    .forEach(entry -> sorted.put(entry.getKey(), sortJson(entry.getValue())));
            return sorted;
        }
        if (node.isNumber()) return node.numberValue();
        if (node.isBoolean()) return node.booleanValue();
        return node.asText();
    }

    private List<JsonNode> extractRows(JsonNode dataNode) {
        if (dataNode == null || dataNode.isNull() || dataNode.isMissingNode()) {
            return List.of();
        }
        if (dataNode.isArray()) {
            List<JsonNode> rows = new ArrayList<>();
            dataNode.forEach(rows::add);
            return rows;
        }
        return List.of(dataNode);
    }

    private PaymentEventResponse toResponse(PaymentEvent event) {
        return new PaymentEventResponse(
                String.valueOf(event.getId()),
                event.getProvider(),
                event.getProviderTxId(),
                event.getAmount(),
                event.getTransferContent(),
                event.getMatchedCode(),
                event.getBankAccount(),
                event.getBankSubAcc(),
                event.getTxTime(),
                event.getLinkedOrderCode(),
                event.getLinkedAt(),
                event.getLinkedBy(),
                mapStatus(event.getStatus()),
                event.getCreatedAt()
        );
    }

    private String mapStatus(PaymentEvent.Status status) {
        return switch (status) {
            case UNMATCHED -> "unmatched";
            case MATCHED -> "matched";
            case IGNORED -> "ignored";
            case LINKED -> "linked";
        };
    }

    private int sanitizeLimit(int limit, int fallback) {
        if (limit <= 0) return fallback;
        return Math.min(limit, 500);
    }

    private String extractOrderCode(String transferContent) {
        if (!StringUtils.hasText(transferContent)) return null;
        Matcher matcher = ORDER_CODE_PATTERN.matcher(transferContent.toUpperCase(Locale.ROOT));
        if (matcher.find()) {
            return matcher.group();
        }
        String trimmed = transferContent.trim().toUpperCase(Locale.ROOT);
        return ORDER_CODE_PATTERN.matcher(trimmed).matches() ? trimmed : null;
    }

    private String text(JsonNode row, String field) {
        JsonNode value = row.get(field);
        return value == null || value.isNull() ? null : value.asText(null);
    }

    private BigDecimal decimal(JsonNode row, String field) {
        String raw = text(row, field);
        if (!StringUtils.hasText(raw)) return BigDecimal.ZERO;
        return new BigDecimal(raw.trim());
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) return value;
        }
        return null;
    }

    private LocalDateTime parseTimestamp(String raw) {
        if (!StringUtils.hasText(raw)) return null;
        try {
            return LocalDateTime.parse(raw, CASSO_DATE_TIME);
        } catch (DateTimeParseException ignored) {
        }
        try {
            return LocalDate.parse(raw, CASSO_DATE).atStartOfDay();
        } catch (DateTimeParseException ignored) {
        }
        return null;
    }

    public record CassoIngestResult(int received, int upserted, int autoLinked, int markedPaidAuto) {}

    private record UpsertOutcome(boolean upserted, boolean autoLinked, boolean markedPaidAuto) {}
}
