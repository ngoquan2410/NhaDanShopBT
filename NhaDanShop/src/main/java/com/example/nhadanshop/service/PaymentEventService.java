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
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.security.crypto.codec.Hex;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import jakarta.persistence.criteria.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentEventService {

    /** Canonical hyphenated order reference, e.g. {@code DH-20260512-014}. */
    private static final Pattern ORDER_CODE_HYPHEN =
            Pattern.compile("\\b(DH)-(\\d{8})-(\\d{3,})\\b", Pattern.CASE_INSENSITIVE);
    /**
     * Bank apps may strip hyphens: {@code DH20260512014} → canonical {@code DH-20260512-014}.
     */
    private static final Pattern ORDER_CODE_COMPACT =
            Pattern.compile("\\b(DH)(\\d{8})(\\d{3,})\\b", Pattern.CASE_INSENSITIVE);
    private static final DateTimeFormatter CASSO_DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter CASSO_DATE = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private final PaymentEventRepository paymentEventRepository;
    private final PendingOrderRepository pendingOrderRepository;
    private final PendingOrderService pendingOrderService;
    private final ObjectMapper objectMapper;
    private final Clock businessClock;

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
    public Page<PaymentEventResponse> listUnmatchedPage(String search, Pageable pageable) {
        return paymentEventRepository.findAll(buildUnmatchedSpec(normalizeBlank(search)), pageable).map(this::toResponse);
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

        if (isAlreadyLinkedTo(order, event)) {
            PendingOrderResponse pendingOrder = pendingOrderService.getById(order.getId());
            return new PaymentEventLinkResponse(toResponse(event), pendingOrder, false);
        }
        ensureManualLinkAllowed(order, event);
        attachEventToOrder(event, order, normalizeManualLinkedBy(linkedBy));

        paymentEventRepository.save(event);
        maybeMarkPaidAutoAfterManualLink(order.getId(), event.getAmount());
        PendingOrderResponse pendingOrder = pendingOrderService.getById(order.getId());
        return new PaymentEventLinkResponse(toResponse(event), pendingOrder, false);
    }

    /**
     * Manual link never confirms or creates an invoice. When the transfer amount matches the pending
     * total exactly and the order is still awaiting payment/review, move to {@link PendingOrder.Status#PAID_AUTO}.
     */
    private void maybeMarkPaidAutoAfterManualLink(Long orderId, BigDecimal paidAmount) {
        if (paidAmount == null || orderId == null) {
            return;
        }
        pendingOrderRepository.findById(orderId).ifPresent(o -> {
            if (o.getTotalAmount() == null || paidAmount.compareTo(o.getTotalAmount()) != 0) {
                return;
            }
            if (o.getInvoice() != null) {
                return;
            }
            if (o.getStatus() != PendingOrder.Status.PENDING_PAYMENT
                    && o.getStatus() != PendingOrder.Status.WAITING_CONFIRM) {
                return;
            }
            o.setStatus(PendingOrder.Status.PAID_AUTO);
            pendingOrderRepository.save(o);
        });
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

        boolean markedPaidAuto = false;
        if (StringUtils.hasText(matchedCode) && event.getLinkedPendingOrder() == null) {
            markedPaidAuto = maybeAutoConfirmCassoBankTransfer(event, matchedCode);
        } else if (event.getLinkedPendingOrder() != null && isAutoLinkedEvent(event)) {
            markedPaidAuto = maybeMarkOrderPaidAuto(event.getLinkedPendingOrder(), event.getAmount());
        }

        paymentEventRepository.save(event);
        return new UpsertOutcome(true, markedPaidAuto, markedPaidAuto);
    }

    private void attachEventToOrder(PaymentEvent event, PendingOrder order, String linkedBy) {
        event.setLinkedPendingOrder(order);
        event.setLinkedOrderCode(order.getOrderNo());
        event.setLinkedAt(LocalDateTime.now());
        event.setLinkedBy(linkedBy);
        event.setStatus(PaymentEvent.Status.LINKED);
    }

    private boolean isAlreadyLinkedTo(PendingOrder order, PaymentEvent event) {
        return event.getLinkedPendingOrder() != null
                && event.getLinkedPendingOrder().getId().equals(order.getId());
    }

    private boolean isAutoLinkedEvent(PaymentEvent event) {
        if (event == null || !StringUtils.hasText(event.getLinkedBy())) {
            return false;
        }
        String linkedBy = event.getLinkedBy().trim().toLowerCase(Locale.ROOT);
        return "auto".equals(linkedBy) || "webhook".equals(linkedBy) || linkedBy.startsWith("casso:webhook");
    }

    private String normalizeManualLinkedBy(String linkedBy) {
        if (!StringUtils.hasText(linkedBy)) {
            return "admin";
        }
        String normalized = linkedBy.trim().toLowerCase(Locale.ROOT);
        if ("manual".equals(normalized) || "admin".equals(normalized)) {
            return normalized;
        }
        return "admin";
    }

    private void ensureManualLinkAllowed(PendingOrder order, PaymentEvent event) {
        PendingOrder linkedOrder = event.getLinkedPendingOrder();
        if (linkedOrder != null) {
            throw new IllegalStateException("Giao dịch đã được liên kết với đơn hàng khác");
        }
        if (!isManualLinkableStatus(order.getStatus())) {
            throw new IllegalStateException("Đơn không còn đủ điều kiện để gắn giao dịch.");
        }
        if (order.getInvoice() != null) {
            throw new IllegalStateException("Đơn không còn đủ điều kiện để gắn giao dịch.");
        }
        if (order.getExpiresAt() == null || !order.getExpiresAt().isAfter(LocalDateTime.now(businessClock))) {
            throw new IllegalStateException("Đơn không còn đủ điều kiện để gắn giao dịch.");
        }
    }

    private boolean isManualLinkableStatus(PendingOrder.Status status) {
        return status == PendingOrder.Status.PENDING_PAYMENT
                || status == PendingOrder.Status.WAITING_CONFIRM
                || status == PendingOrder.Status.PAID_AUTO;
    }

    private boolean maybeAutoConfirmCassoBankTransfer(PaymentEvent event, String matchedCode) {
        Optional<PendingOrder> matchedOrder = pendingOrderRepository.findByOrderCodeOrPaymentReference(matchedCode);
        if (matchedOrder.isEmpty()) {
            log.debug("casso.autoConfirm reason=ORDER_NOT_FOUND matchedCode={}", matchedCode);
            return false;
        }
        PendingOrder order = matchedOrder.get();
        if (!isAutoConfirmEligible(order, event.getAmount())) {
            if (event.getAmount() != null && order.getTotalAmount() != null) {
                int cmp = event.getAmount().compareTo(order.getTotalAmount());
                if (cmp < 0) {
                    log.debug("casso.autoConfirm reason=AMOUNT_UNDERPAID order={}", order.getOrderNo());
                } else if (cmp > 0) {
                    log.debug("casso.autoConfirm reason=AMOUNT_OVERPAID order={}", order.getOrderNo());
                } else {
                    log.debug("casso.autoConfirm reason=ORDER_NOT_ELIGIBLE order={}", order.getOrderNo());
                }
            } else {
                log.debug("casso.autoConfirm reason=ORDER_NOT_ELIGIBLE order={}", order.getOrderNo());
            }
            return false;
        }
        boolean confirmed = maybeMarkOrderPaidAuto(order, event.getAmount());
        if (confirmed) {
            log.debug("casso.autoConfirm reason=AUTO_CONFIRMED order={}", order.getOrderNo());
            PendingOrder fresh = pendingOrderRepository.findById(order.getId()).orElse(order);
            attachEventToOrder(event, fresh, "casso:webhook");
        } else {
            log.debug("casso.autoConfirm reason=CONFIRM_FAILED order={}", order.getOrderNo());
        }
        return confirmed;
    }

    private boolean maybeMarkOrderPaidAuto(PendingOrder order, BigDecimal amount) {
        if (!isAutoConfirmEligible(order, amount)) {
            return false;
        }
        if (order.getStatus() == PendingOrder.Status.CONFIRMED) {
            PendingOrder fresh = pendingOrderRepository.findById(order.getId()).orElse(order);
            return fresh.getInvoice() != null;
        }
        try {
            pendingOrderService.confirmOrder(order.getId(), null, "casso:webhook");
            return true;
        } catch (Exception ex) {
            log.warn("Casso auto-confirm failed for {}: {}", order.getOrderNo(), ex.toString());
            return false;
        }
    }

    private boolean isAutoConfirmEligible(PendingOrder order, BigDecimal amount) {
        if (amount == null || order == null) {
            return false;
        }
        if (!"bank_transfer".equals(order.getPaymentMethod())) {
            return false;
        }
        if (!isManualLinkableStatus(order.getStatus())) {
            return false;
        }
        if (order.getInvoice() != null) {
            return false;
        }
        if (order.getExpiresAt() == null || !order.getExpiresAt().isAfter(LocalDateTime.now(businessClock))) {
            return false;
        }
        return order.getTotalAmount() != null && amount.compareTo(order.getTotalAmount()) == 0;
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

    private String normalizeBlank(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private Specification<PaymentEvent> buildUnmatchedSpec(String search) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(cb.isNull(root.get("linkedPendingOrder")));
            predicates.add(cb.notEqual(root.get("status"), PaymentEvent.Status.IGNORED));
            if (search != null) {
                String likePattern = "%" + search.toUpperCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.upper(cb.coalesce(root.get("providerTxId"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("transferContent"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("matchedCode"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("linkedOrderCode"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("bankAccount"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("bankSubAcc"), "")), likePattern)
                ));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    /**
     * Collects all candidate order codes, normalizes to canonical {@code DH-YYYYMMDD-SEQ} form,
     * de-duplicates; returns a single code, or {@code null} for none / ambiguous (multiple distinct codes).
     */
    private String extractOrderCode(String transferContent) {
        if (!StringUtils.hasText(transferContent)) {
            log.debug("casso.orderCode reason=NO_CODE (empty content)");
            return null;
        }
        String upper = transferContent.toUpperCase(Locale.ROOT);
        Set<String> normalized = new LinkedHashSet<>();

        Matcher hyphen = ORDER_CODE_HYPHEN.matcher(upper);
        while (hyphen.find()) {
            normalized.add(hyphen.group(1) + "-" + hyphen.group(2) + "-" + hyphen.group(3));
        }
        Matcher compact = ORDER_CODE_COMPACT.matcher(upper);
        while (compact.find()) {
            normalized.add(compact.group(1) + "-" + compact.group(2) + "-" + compact.group(3));
        }

        if (normalized.isEmpty()) {
            log.debug("casso.orderCode reason=NO_CODE");
            return null;
        }
        if (normalized.size() > 1) {
            log.debug("casso.orderCode reason=MULTIPLE_CODES candidates={}", normalized);
            return null;
        }
        String single = normalized.iterator().next();
        log.debug("casso.orderCode reason=EXTRACTED code={}", single);
        return single;
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
