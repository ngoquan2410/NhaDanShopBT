package com.example.nhadanshop.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.concurrent.atomic.AtomicInteger;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.stream.Stream;
import java.util.Locale;
import jakarta.persistence.criteria.Predicate;

@Service
@RequiredArgsConstructor
public class PendingOrderService {

    private final PendingOrderRepository pendingOrderRepo;
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final ProductRepository productRepo;
    private final ProductVariantRepository variantRepository;
    private final UserRepository userRepo;
    private final InvoiceService invoiceService;
    private final ProductVariantService variantService; // Sprint 0
    private final ObjectMapper objectMapper;
    private final CustomerRepository customerRepository;
    private final PromotionRepository promotionRepository;
    private final VoucherRepository voucherRepository;
    private final SalesQuoteRepository salesQuoteRepository;
    private final ProductBatchRepository productBatchRepository;
    private final Clock businessClock;
    private final CustomerLoyaltyService loyaltyService;
    private final AccountService accountService;
    private final ProductComboRepository comboItemRepo;
    private final PaymentEventRepository paymentEventRepository;
    private final SellableStockService sellableStockService;

    private static final Set<String> ONLINE_PAYMENT_METHODS = Set.of(
            "bank_transfer", "momo", "zalopay", "cod", "cash_on_delivery");
    private static final Set<String> PENDING_ORDER_SORT_WHITELIST = Set.of(
            "createdAt", "totalAmount", "status", "paymentMethod", "customerName", "orderNo", "expiresAt");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private final AtomicInteger orderSeq = new AtomicInteger(0);
    private volatile String orderLastDate = "";

    private synchronized String nextOrderNo() {
        String today = LocalDate.now().format(DATE_FMT);
        if (!today.equals(orderLastDate)) {
            orderLastDate = today;
            long count = pendingOrderRepo.count(); // seed đơn giản
            orderSeq.set((int) count);
        }
        return "DH-" + today + "-" + String.format("%03d", orderSeq.incrementAndGet());
    }

    @Transactional
    public PendingOrderResponse createOrder(PendingOrderRequest req) {
        if (req.quotePublicId() == null || req.quotePublicId().isBlank()) {
            throw new IllegalArgumentException("Pending order requires backend quotePublicId");
        }
        return createOrderFromBackendQuote(req);
    }

    private PendingOrderResponse createOrderFromBackendQuote(PendingOrderRequest req) {
        if (!ONLINE_PAYMENT_METHODS.contains(req.paymentMethod())) {
            throw new IllegalArgumentException(
                    "Pending order chỉ hỗ trợ bank_transfer, momo, zalopay, cod, cash_on_delivery");
        }
        SalesQuote quote = salesQuoteRepository.findByPublicIdForUpdate(req.quotePublicId().trim())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy quote"));
        if (quote.getConsumedInvoice() != null || quote.getConsumedPendingOrder() != null) {
            throw new IllegalStateException("Quote đã được dùng");
        }
        if (quote.isExpired(businessClock)) {
            throw new IllegalStateException("Quote đã hết hạn");
        }
        SalesQuotePayloadDto payload;
        try {
            payload = objectMapper.readValue(quote.getPayloadJson(), SalesQuotePayloadDto.class);
        } catch (Exception e) {
            throw new IllegalStateException("Không đọc được quote payload", e);
        }
        if (payload.pricingBreakdownSnapshot() == null) {
            throw new IllegalStateException("Thiếu pricingBreakdownSnapshot trong quote");
        }

        LoyaltyRedemptionSnapshotDto loyaltySnapshot = payload.loyaltySnapshot();
        Long boundCustomerId = resolveAllowedCustomerBinding(req.customerId(), loyaltySnapshot);
        if (boundCustomerId != null) {
            customerRepository.findById(boundCustomerId).ifPresent(
                    c -> ActiveEntityGuards.requireActiveCustomerForBinding(c, boundCustomerId));
        }

        PendingOrder order = new PendingOrder();
        order.setOrderNo(nextOrderNo());
        order.setQuotePublicId(req.quotePublicId().trim());
        order.setCustomerId(boundCustomerId != null ? String.valueOf(boundCustomerId) : null);
        order.setCustomerName(req.customerName());
        order.setCustomerPhone(req.customerPhone());
        order.setNote(req.note());
        order.setPaymentMethod(req.paymentMethod());
        order.setPaymentReference(order.getOrderNo());
        order.setStatus(PendingOrder.Status.PENDING_PAYMENT);
        order.setExpiresAt(req.expiresAt() != null ? req.expiresAt() : LocalDateTime.now(businessClock).plusHours(12));
        order.setShippingAddressJson(writeJson(req.shippingAddress()));
        order.setGiftLinesSnapshotJson(writeJson(
                payload.promotionSnapshot() != null ? safeList(payload.promotionSnapshot().giftLines()) : List.of()));
        order.setPromotionSnapshotJson(writeJson(payload.promotionSnapshot()));
        order.setVoucherSnapshotJson(writeJson(payload.voucherSnapshot()));
        order.setShippingQuoteSnapshotJson(writeJson(payload.shippingQuoteSnapshot()));
        order.setPricingBreakdownSnapshotJson(writeJson(payload.pricingBreakdownSnapshot()));
        order.setTotalAmount(nvl(payload.pricingBreakdownSnapshot().total()));

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.isAuthenticated()
                && authentication.getName() != null
                && !"anonymousUser".equals(authentication.getName())) {
            userRepo.findByUsername(authentication.getName()).ifPresent(order::setCreatedBy);
        }

        ArrayList<SalesQuoteCapturedLineDto> merged = new ArrayList<>(payload.lines());
        merged.addAll(payload.rewardLines());
        if (merged.isEmpty()) {
            throw new IllegalArgumentException("Quote không chứa dòng hàng");
        }
        int seq = 0;
        for (SalesQuoteCapturedLineDto cap : merged) {
            Product product = productRepo.findById(cap.productId())
                    .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy sản phẩm"));
            if (!product.getActive()) {
                throw new IllegalArgumentException("Sản phẩm '" + product.getName() + "' đã ngừng kinh doanh");
            }
            ProductVariant variant = variantService.resolveVariant(cap.variantId(), product.getId(), true);
            if (!Boolean.TRUE.equals(variant.getActive())) {
                throw new IllegalArgumentException("Variant không hoạt động");
            }
            if (!Boolean.TRUE.equals(variant.getIsSellable())) {
                throw new IllegalArgumentException("Variant không bán được");
            }
            boolean reward = cap.rewardLine();
            if (product.isCombo()) {
                if (cap.batchId() != null) {
                    throw new IllegalArgumentException("Combo pending-order không hỗ trợ batchId");
                }
                List<ProductComboItem> comboItems = comboItemRepo.findByComboProduct(product);
                if (comboItems.isEmpty()) {
                    throw new IllegalStateException("Combo '" + product.getName() + "' chưa có thành phần");
                }
                int comboQty = cap.quantity();
                sellableStockService.assertComboSalesSellable(
                        product,
                        comboQty,
                        LocalDate.now(businessClock),
                        reward
                                ? "Khong du hang reward combo '" + product.getName() + "'"
                                : "Khong du hang cho combo '" + product.getName() + "'");
            } else {
                if (!reward && cap.batchId() == null
                        && sellableStockService.salesSellableQtyByVariantId(variant.getId(), LocalDate.now(businessClock)) < cap.quantity()) {
                    throw new IllegalArgumentException(
                            "Không đủ hàng [" + variant.getVariantCode() + "]");
                }
                if (reward && sellableStockService.salesSellableQtyByVariantId(variant.getId(), LocalDate.now(businessClock)) < cap.quantity()) {
                    throw new IllegalArgumentException(
                            "Không đủ hàng reward [" + variant.getVariantCode() + "]");
                }
            }
            PendingOrderItem item = new PendingOrderItem();
            item.setPendingOrder(order);
            item.setProduct(product);
            item.setVariant(variant);
            item.setLineId("q-" + (++seq));
            item.setProductNameSnapshot(product.getName());
            item.setVariantNameSnapshot(variant.getVariantName());
            item.setQuantity(cap.quantity());
            item.setUnitPrice(nvl(cap.unitPrice()));
            item.setLineSubtotal(nvl(cap.lineSubtotal()));
            item.setRewardLine(reward);
            item.setOriginalUnitPrice(cap.originalUnitPrice());
            applyCommercialSnapshotToPendingItem(item, cap.commercialSnapshot());
            if (cap.batchId() != null) {
                ProductBatch batch = productBatchRepository.findById(cap.batchId())
                        .orElseThrow(() -> new EntityNotFoundException("batchId không hợp lệ"));
                if (!batch.getVariant().getId().equals(variant.getId())) {
                    throw new IllegalArgumentException("batchId không khớp variant");
                }
                item.setBatch(batch);
            }
            order.getItems().add(item);
        }
        assertPendingVariantDemandAvailable(order.getItems());

        PendingOrder savedOrder = pendingOrderRepo.save(order);
        SalesQuote locked = salesQuoteRepository.findByPublicIdForUpdate(req.quotePublicId().trim())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy quote"));
        if (locked.getConsumedInvoice() != null || locked.getConsumedPendingOrder() != null) {
            throw new IllegalStateException("Quote đã được dùng");
        }
        locked.setConsumedPendingOrder(savedOrder);
        locked.setConsumedAt(LocalDateTime.now(businessClock));
        salesQuoteRepository.save(locked);

        loyaltyService.reserveForPendingOrder(savedOrder, loyaltySnapshot);

        return toResponse(savedOrder);
    }

    private void assertPendingVariantDemandAvailable(List<PendingOrderItem> items) {
        Map<Long, Integer> demandByVariant = new HashMap<>();
        for (PendingOrderItem item : items) {
            if (item.getProduct() != null && item.getProduct().isCombo()) {
                continue;
            }
            if (item.getVariant() == null || item.getVariant().getId() == null) {
                continue;
            }
            demandByVariant.merge(item.getVariant().getId(), item.getQuantity(), Integer::sum);
        }
        for (Map.Entry<Long, Integer> entry : demandByVariant.entrySet()) {
            ProductVariant variant = variantRepository.findById(entry.getKey()).orElseThrow();
            int sellableQty = sellableStockService.salesSellableQtyByVariantId(entry.getKey(), LocalDate.now(businessClock));
            if (sellableQty < entry.getValue()) {
                throw new IllegalArgumentException(
                        "Không đủ tồn bán được cho đơn hàng và quà tặng [" + variant.getVariantCode()
                                + "]. Cần " + entry.getValue() + ", còn " + sellableQty + ".");
            }
        }
    }

    @Transactional
    public Page<PendingOrderResponse> listPage(Pageable pageable) {
        Page<PendingOrder> page = pendingOrderRepo.findAllByOrderByCreatedAtDesc(pageable);
        List<PendingOrderResponse> content = mapOrdersForList(page.getContent());
        return new PageImpl<>(content, pageable, page.getTotalElements());
    }

    @Transactional
    public Page<PendingOrderResponse> listAdminPage(
            Integer page,
            Integer size,
            String status,
            String paymentMethod,
            String search,
            Pageable pageable) {
        Pageable safePageable = sanitizePageable(page, size, pageable);
        PendingOrder.Status statusEnum = parseStatus(status);
        String normalizedPaymentMethod = normalizeBlank(paymentMethod);
        String normalizedSearch = normalizeBlank(search);
        Page<PendingOrder> poPage = pendingOrderRepo.findAll(
                buildAdminListSpec(statusEnum, normalizedPaymentMethod, normalizedSearch), safePageable);
        List<PendingOrderResponse> content = mapOrdersForList(poPage.getContent());
        return new PageImpl<>(content, safePageable, poPage.getTotalElements());
    }

    @Transactional
    public Page<PendingOrderResponse> listLinkableCandidates(
            Integer page,
            Integer size,
            String search,
            Pageable pageable) {
        Pageable safePageable = sanitizePageable(page, size, pageable);
        Page<PendingOrder> poPage = pendingOrderRepo.findLinkableCandidates(
                linkableStatuses(),
                LocalDateTime.now(businessClock),
                normalizeBlank(search),
                safePageable);
        List<PendingOrderResponse> content = mapOrdersForList(poPage.getContent());
        return new PageImpl<>(content, safePageable, poPage.getTotalElements());
    }

    @Transactional
    public PendingOrderCountsResponse countAdmin(String paymentMethod, String search) {
        String normalizedPaymentMethod = normalizeBlank(paymentMethod);
        String normalizedSearch = normalizeBlank(search);
        long pendingPayment = pendingOrderRepo.count(
                buildAdminListSpec(PendingOrder.Status.PENDING_PAYMENT, normalizedPaymentMethod, normalizedSearch));
        long waitingConfirm = pendingOrderRepo.count(
                buildAdminListSpec(PendingOrder.Status.WAITING_CONFIRM, normalizedPaymentMethod, normalizedSearch));
        long paidAuto = pendingOrderRepo.count(
                buildAdminListSpec(PendingOrder.Status.PAID_AUTO, normalizedPaymentMethod, normalizedSearch));
        long confirmed = pendingOrderRepo.count(
                buildAdminListSpec(PendingOrder.Status.CONFIRMED, normalizedPaymentMethod, normalizedSearch));
        long cancelled = pendingOrderRepo.count(
                buildAdminListSpec(PendingOrder.Status.CANCELLED, normalizedPaymentMethod, normalizedSearch));
        return new PendingOrderCountsResponse(
                pendingPayment + waitingConfirm + paidAuto + confirmed + cancelled,
                pendingPayment,
                waitingConfirm,
                paidAuto,
                confirmed,
                cancelled
        );
    }

    @Transactional
    public List<PendingOrderResponse> listAll() {
        return mapOrdersForList(pendingOrderRepo.findAllByOrderByCreatedAtDesc());
    }

    @Transactional
    public List<PendingOrderResponse> listRecoverableForCustomer(Long customerId) {
        if (customerId == null) return List.of();
        List<PendingOrder> rows = pendingOrderRepo.findByCustomerIdAndStatusInAndExpiresAtAfterOrderByCreatedAtDesc(
                String.valueOf(customerId),
                List.of(
                        PendingOrder.Status.PENDING_PAYMENT,
                        PendingOrder.Status.WAITING_CONFIRM,
                        PendingOrder.Status.PAID_AUTO),
                LocalDateTime.now(businessClock));
        return mapOrdersForList(rows);
    }

    @Transactional
    public PendingOrderResponse getById(Long id) {
        pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));
        PendingOrder order = pendingOrderRepo.findAllByIdInForListHydrate(List.of(id)).stream()
                .findFirst()
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));
        return toResponse(order, true);
    }

    @Transactional
    public PendingOrderResponse getByCode(String code) {
        PendingOrder ref = pendingOrderRepo.findByOrderNo(code)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng mã: " + code));
        PendingOrder order = pendingOrderRepo.findAllByIdInForListHydrate(List.of(ref.getId())).stream()
                .findFirst()
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng mã: " + code));
        return toResponse(order, true);
    }

    @Transactional
    public PendingOrderResponse markWaitingConfirm(Long id, String note) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));

        if (isTerminal(order)) {
            throw new IllegalStateException("Đơn hàng đã ở trạng thái cuối, không thể chuyển sang waiting_confirm");
        }

        order.setStatus(PendingOrder.Status.WAITING_CONFIRM);
        order.setNote(appendNote(order.getNote(), note));
        return toResponse(pendingOrderRepo.save(order));
    }

    @Transactional
    public PendingOrderResponse changePaymentMethod(Long id, String paymentMethod) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));

        if (!ONLINE_PAYMENT_METHODS.contains(paymentMethod)) {
            throw new IllegalArgumentException(
                    "Chỉ hỗ trợ bank_transfer, momo, zalopay, cod, cash_on_delivery");
        }
        if (isTerminal(order)) {
            throw new IllegalStateException("Đơn hàng đã ở trạng thái cuối, không thể đổi phương thức thanh toán");
        }

        order.setPaymentMethod(paymentMethod);
        order.setPaymentReference(order.getOrderNo());
        return toResponse(pendingOrderRepo.save(order));
    }

    @Transactional
    public PendingOrderConfirmResponse confirmOrder(Long id, String note, String confirmedBy) {
        PendingOrder order = pendingOrderRepo.findByIdForUpdate(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));

        if (order.getStatus() == PendingOrder.Status.CANCELLED) {
            throw new IllegalStateException(
                    "Đơn hàng " + order.getOrderNo() + " đã bị hủy, không thể xác nhận");
        }

        if (order.getStatus() == PendingOrder.Status.CONFIRMED) {
            SalesInvoice existingInvoice = order.getInvoice();
            if (existingInvoice == null) {
                throw new IllegalStateException(
                        "Đơn hàng " + order.getOrderNo() + " đã xác nhận nhưng chưa liên kết hóa đơn");
            }
            PendingOrderResponse pendingOrder = toResponse(order);
            return new PendingOrderConfirmResponse(pendingOrder, DtoMapper.toResponse(existingInvoice, order.getOrderNo()));
        }

        if (order.getStatus() != PendingOrder.Status.PENDING_PAYMENT
                && order.getStatus() != PendingOrder.Status.WAITING_CONFIRM
                && order.getStatus() != PendingOrder.Status.PAID_AUTO) {
            throw new IllegalStateException(
                    "Đơn hàng " + order.getOrderNo() + " không ở trạng thái có thể xác nhận");
        }

        if (isBankTransfer(order)) {
            LinkedAggregate aggregate = aggregateLinkedPaymentForOrder(order.getId());
            BigDecimal total = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
            BigDecimal sumLinked = aggregate.sum() != null ? aggregate.sum() : BigDecimal.ZERO;
            if (aggregate.count() < 1L) {
                throw new IllegalStateException(
                        "Đơn " + order.getOrderNo() + " chưa có giao dịch ngân hàng đã gắn — chưa thể xác nhận");
            }
            if (sumLinked.compareTo(total) < 0) {
                throw new IllegalStateException(
                        "Tổng giao dịch đã gắn (" + sumLinked + ") nhỏ hơn tổng đơn (" + total
                                + ") — chưa đủ điều kiện xác nhận");
            }
        }

        order.setNote(appendNote(order.getNote(), note));
        SalesInvoice invoice = invoiceService.createInvoiceFromPendingOrder(order, confirmedBy);
        order.setInvoice(invoice);
        loyaltyService.redeemForPendingOrder(order, invoice, confirmedBy != null ? confirmedBy : "pending_confirm");
        loyaltyService.earnForInvoice(invoice);
        order.setStatus(PendingOrder.Status.CONFIRMED);
        pendingOrderRepo.save(order);

        PendingOrderResponse pendingOrder = toResponse(order);
        return new PendingOrderConfirmResponse(pendingOrder, DtoMapper.toResponse(invoice, order.getOrderNo()));
    }

    @Transactional
    public PendingOrderResponse cancelOrder(Long id, String reason) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));

        if (isTerminal(order)) {
            throw new IllegalStateException(
                    "Đơn hàng " + order.getOrderNo() + " không ở trạng thái có thể hủy");
        }

        order.setStatus(PendingOrder.Status.CANCELLED);
        order.setCancelReason(reason);
        loyaltyService.releaseForPendingOrder(order, CustomerPointReservation.Status.RELEASED);
        return toResponse(pendingOrderRepo.save(order));
    }

    @Transactional
    public PendingOrderResponse cancelRecoverableForCustomer(Long id, Long customerId, String reason) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));
        if (customerId == null || order.getCustomerId() == null || !order.getCustomerId().equals(String.valueOf(customerId))) {
            throw new IllegalArgumentException("Không thể hủy đơn không thuộc tài khoản hiện tại");
        }
        if (order.getStatus() != PendingOrder.Status.PENDING_PAYMENT) {
            throw new IllegalStateException("Chỉ có thể sửa đơn đang chờ thanh toán");
        }
        return cancelOrder(id, reason);
    }

    @Scheduled(fixedDelay = 120_000)
    @Transactional
    public void cancelExpiredOrders() {
        List<PendingOrder> expired = pendingOrderRepo.findByStatusAndExpiresAtBefore(
                PendingOrder.Status.PENDING_PAYMENT, LocalDateTime.now());
        for (PendingOrder order : expired) {
            order.setStatus(PendingOrder.Status.CANCELLED);
            order.setCancelReason("Hết hạn xác nhận");
            loyaltyService.releaseForPendingOrder(order, CustomerPointReservation.Status.EXPIRED);
            pendingOrderRepo.save(order);
        }
    }

    /**
     * List/account paths: batch-hydrate lines (+ optional batch FK) once per slice; omit nested sales invoice
     * (Phase 2B — FE does not consume {@code invoice} on list per Phase 2A sign-off).
     */
    private List<PendingOrderResponse> mapOrdersForList(List<PendingOrder> orderedLightRows) {
        if (orderedLightRows.isEmpty()) {
            return List.of();
        }
        List<Long> ids = orderedLightRows.stream().map(PendingOrder::getId).filter(Objects::nonNull).toList();
        List<PendingOrder> hydrated = pendingOrderRepo.findAllByIdInForListHydrate(ids);
        Map<Long, PendingOrder> byId = hydrated.stream().collect(Collectors.toMap(PendingOrder::getId, Function.identity()));
        Map<Long, PaymentEvent> linkedByOrder = pickLatestLinkedPaymentEventPerOrder(ids);
        Map<Long, LinkedAggregate> aggregateByOrder = aggregateLinkedPaymentByOrder(ids);
        return orderedLightRows.stream()
                .map(po -> mapToPendingOrderResponse(
                        Objects.requireNonNull(byId.get(po.getId()), "missing pending id " + po.getId()),
                        false,
                        linkedByOrder.get(po.getId()),
                        aggregateByOrder.getOrDefault(po.getId(), LinkedAggregate.zero())))
                .toList();
    }

    private Map<Long, PaymentEvent> pickLatestLinkedPaymentEventPerOrder(List<Long> orderIds) {
        if (orderIds.isEmpty()) {
            return Map.of();
        }
        List<PaymentEvent> rows = paymentEventRepository.findByLinkedPendingOrder_IdInAndStatus(
                orderIds, PaymentEvent.Status.LINKED);
        Map<Long, PaymentEvent> best = new HashMap<>();
        for (PaymentEvent e : rows) {
            if (e.getLinkedPendingOrder() == null) {
                continue;
            }
            Long oid = e.getLinkedPendingOrder().getId();
            PaymentEvent prev = best.get(oid);
            if (prev == null) {
                best.put(oid, e);
                continue;
            }
            LocalDateTime pt = prev.getLinkedAt();
            LocalDateTime et = e.getLinkedAt();
            if (et != null && (pt == null || et.isAfter(pt))) {
                best.put(oid, e);
            }
        }
        return best;
    }

    private Map<Long, LinkedAggregate> aggregateLinkedPaymentByOrder(Collection<Long> orderIds) {
        if (orderIds == null || orderIds.isEmpty()) {
            return Map.of();
        }
        List<Object[]> rows = paymentEventRepository.aggregateLinkedByOrderIds(orderIds);
        Map<Long, LinkedAggregate> result = new HashMap<>();
        for (Object[] row : rows) {
            if (row == null || row[0] == null) {
                continue;
            }
            Long oid = ((Number) row[0]).longValue();
            BigDecimal sum = row[1] != null ? (BigDecimal) row[1] : BigDecimal.ZERO;
            long count = row[2] != null ? ((Number) row[2]).longValue() : 0L;
            result.put(oid, new LinkedAggregate(sum, count));
        }
        return result;
    }

    /**
     * Single-order aggregate; only call on confirm/detail paths where one extra query is cheap. List paths
     * MUST use {@link #aggregateLinkedPaymentByOrder(Collection)} to keep query count bounded.
     */
    private LinkedAggregate aggregateLinkedPaymentForOrder(Long orderId) {
        if (orderId == null) {
            return LinkedAggregate.zero();
        }
        return aggregateLinkedPaymentByOrder(List.of(orderId)).getOrDefault(orderId, LinkedAggregate.zero());
    }

    private PendingOrderResponse toResponse(PendingOrder order) {
        return toResponse(order, true);
    }

    private PendingOrderResponse toResponse(PendingOrder order, boolean includeFullInvoice) {
        PaymentEvent linked = paymentEventRepository
                .findFirstByLinkedPendingOrder_IdOrderByLinkedAtDesc(order.getId())
                .orElse(null);
        LinkedAggregate aggregate = aggregateLinkedPaymentForOrder(order.getId());
        return mapToPendingOrderResponse(order, includeFullInvoice, linked, aggregate);
    }

    private record PaymentLinkSlice(
            String paymentLinkStatus,
            BigDecimal paymentDelta,
            Long linkedPaymentEventId,
            BigDecimal linkedPaymentAmount,
            BigDecimal linkedPaymentTotal,
            long linkedPaymentCount) {
        static PaymentLinkSlice none() {
            return new PaymentLinkSlice("NONE", null, null, null, null, 0L);
        }
    }

    private record LinkedAggregate(BigDecimal sum, long count) {
        static LinkedAggregate zero() {
            return new LinkedAggregate(BigDecimal.ZERO, 0L);
        }
    }

    private boolean isBankTransfer(PendingOrder order) {
        return "bank_transfer".equalsIgnoreCase(order.getPaymentMethod());
    }

    private PaymentLinkSlice derivePaymentLink(PendingOrder order, PaymentEvent linkedOrNull, LinkedAggregate aggregate) {
        if (!isBankTransfer(order)) {
            // Non-bank: zero out link/aggregate semantics so FE never derives an evidence banner.
            return PaymentLinkSlice.none();
        }
        long count = aggregate != null ? aggregate.count() : 0L;
        BigDecimal sum = aggregate != null && aggregate.sum() != null ? aggregate.sum() : BigDecimal.ZERO;
        BigDecimal total = order.getTotalAmount() != null ? order.getTotalAmount() : BigDecimal.ZERO;
        BigDecimal delta = sum.subtract(total);
        String status;
        if (count == 0L) {
            status = "NONE";
        } else if (sum.compareTo(total) == 0) {
            status = "EXACT_PAID";
        } else if (sum.compareTo(total) < 0) {
            status = "UNDERPAID_LINKED";
        } else {
            status = "OVERPAID_LINKED";
        }
        Long latestId = linkedOrNull != null ? linkedOrNull.getId() : null;
        BigDecimal latestAmount = linkedOrNull != null ? linkedOrNull.getAmount() : null;
        return new PaymentLinkSlice(status, delta, latestId, latestAmount, sum, count);
    }

    private PendingOrderResponse mapToPendingOrderResponse(
            PendingOrder order, boolean includeFullInvoice, PaymentEvent linkedOrNull, LinkedAggregate aggregate) {
        ShippingAddressDto shippingAddress = readJson(order.getShippingAddressJson(), new TypeReference<>() {});
        List<GiftLineSnapshotDto> giftLines = readJsonList(order.getGiftLinesSnapshotJson(), new TypeReference<>() {});
        PromotionSnapshotDto promotionSnapshot = readJson(order.getPromotionSnapshotJson(), new TypeReference<>() {});
        VoucherSnapshotDto voucherSnapshot = readJson(order.getVoucherSnapshotJson(), new TypeReference<>() {});
        ShippingQuoteSnapshotDto shippingQuoteSnapshot = readJson(order.getShippingQuoteSnapshotJson(), new TypeReference<>() {});
        PricingBreakdownSnapshotDto pricingBreakdownSnapshot = readJson(order.getPricingBreakdownSnapshotJson(), new TypeReference<>() {});

        List<PendingOrderItemResponse> items = order.getItems().stream()
                .map(i -> new PendingOrderItemResponse(
                        i.getLineId() != null ? i.getLineId() : String.valueOf(i.getId()),
                        String.valueOf(i.getProduct().getId()),
                        i.getVariant() != null ? String.valueOf(i.getVariant().getId()) : null,
                        i.getProductNameSnapshot() != null ? i.getProductNameSnapshot() : i.getProduct().getName(),
                        i.getVariantNameSnapshot(),
                        i.getQuantity(),
                        i.getUnitPrice(),
                        i.getLineSubtotal(),
                        i.getBatch() != null ? i.getBatch().getId() : null,
                        i.isRewardLine(),
                        i.getOriginalUnitPrice(),
                        DtoMapper.commercialSnapshotFromPendingOrderItem(i)
                )).toList();

        SalesInvoiceResponse invoiceOut = null;
        if (includeFullInvoice) {
            SalesInvoice inv = order.getInvoice();
            if (inv != null) {
                invoiceOut = DtoMapper.toResponse(inv, order.getOrderNo());
            }
        }

        PaymentLinkSlice pl = derivePaymentLink(order, linkedOrNull, aggregate);
        return new PendingOrderResponse(
                String.valueOf(order.getId()),
                order.getOrderNo(),
                order.getCreatedAt(),
                order.getExpiresAt(),
                mapStatus(order.getStatus()),
                order.getCustomerId(),
                order.getCustomerName(),
                order.getCustomerPhone(),
                shippingAddress,
                order.getPaymentMethod(),
                order.getPaymentReference() != null ? order.getPaymentReference() : order.getOrderNo(),
                items,
                giftLines,
                promotionSnapshot,
                voucherSnapshot,
                shippingQuoteSnapshot,
                pricingBreakdownSnapshot,
                order.getNote(),
                order.getUpdatedAt(),
                order.getCreatedBy() != null ? order.getCreatedBy().getUsername() : null,
                order.getCancelReason(),
                order.getTotalAmount(),
                invoiceOut,
                pl.paymentLinkStatus(),
                pl.paymentDelta(),
                pl.linkedPaymentEventId(),
                pl.linkedPaymentAmount(),
                pl.linkedPaymentTotal(),
                pl.linkedPaymentCount()
        );
    }

    private boolean isTerminal(PendingOrder order) {
        return order.getStatus() == PendingOrder.Status.CONFIRMED
                || order.getStatus() == PendingOrder.Status.CANCELLED;
    }

    private Set<PendingOrder.Status> linkableStatuses() {
        return Set.of(
                PendingOrder.Status.PENDING_PAYMENT,
                PendingOrder.Status.WAITING_CONFIRM,
                PendingOrder.Status.PAID_AUTO);
    }

    private boolean isAnonymousUser() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth == null || !auth.isAuthenticated()
                || auth.getName() == null
                || "anonymousUser".equalsIgnoreCase(auth.getName());
    }

    private Long resolveAllowedCustomerBinding(String requestedCustomerId, LoyaltyRedemptionSnapshotDto loyaltySnapshot) {
        Long requested = loyaltySnapshot != null && loyaltySnapshot.customerId() != null
                ? loyaltySnapshot.customerId()
                : parseNullableLong(requestedCustomerId);
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated() || auth.getName() == null || "anonymousUser".equalsIgnoreCase(auth.getName())) {
            if (requested != null || (requestedCustomerId != null && !requestedCustomerId.isBlank())) {
                throw new IllegalArgumentException("Khách vãng lai không được gắn customerId; chỉ gửi customerName/customerPhone");
            }
            return null;
        }
        boolean admin = auth.getAuthorities().stream().anyMatch(a -> "ROLE_ADMIN".equals(a.getAuthority()));
        if (admin) return requested;
        boolean customerRole = auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_USER".equals(a.getAuthority()) || "ROLE_CUSTOMER".equals(a.getAuthority()));
        if (!customerRole) return requested;
        Customer own = accountService.ensureLinkedCustomer(auth.getName());
        if (requested != null && !requested.equals(own.getId())) {
            throw new IllegalArgumentException("Không thể tạo đơn cho customerId không thuộc tài khoản đăng nhập");
        }
        return own.getId();
    }

    private String mapStatus(PendingOrder.Status status) {
        return switch (status) {
            case PENDING_PAYMENT -> "pending_payment";
            case WAITING_CONFIRM -> "waiting_confirm";
            case CONFIRMED -> "confirmed";
            case PAID_AUTO -> "paid_auto";
            case CANCELLED -> "cancelled";
        };
    }

    private Long parseLongId(String value, String fieldName) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Giá trị " + fieldName + " không hợp lệ: " + value);
        }
    }

    private Long parseNullableLong(String value) {
        if (value == null || value.isBlank()) return null;
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private BigDecimal nvl(BigDecimal value) {
        return value != null ? value : BigDecimal.ZERO;
    }

    private void validateCheckoutShippingAddress(ShippingAddressDto address) {
        if (address == null) {
            throw new IllegalArgumentException("Vui lòng nhập địa chỉ giao hàng.");
        }
        if (address.street() == null || address.street().trim().isEmpty()) {
            throw new IllegalArgumentException("Vui lòng nhập số nhà/tên đường.");
        }
    }

    private String writeJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new IllegalStateException("Không thể serialize pending-order snapshot", e);
        }
    }

    private <T> T readJson(String value, TypeReference<T> typeReference) {
        if (value == null || value.isBlank()) return null;
        try {
            return objectMapper.readValue(value, typeReference);
        } catch (Exception e) {
            throw new IllegalStateException("Không thể deserialize pending-order snapshot", e);
        }
    }

    private <T> List<T> readJsonList(String value, TypeReference<List<T>> typeReference) {
        if (value == null || value.isBlank()) return List.of();
        try {
            return objectMapper.readValue(value, typeReference);
        } catch (Exception e) {
            throw new IllegalStateException("Không thể deserialize pending-order snapshot list", e);
        }
    }

    private <T> List<T> safeList(List<T> value) {
        return value != null ? value : List.of();
    }

    private String appendNote(String current, String extra) {
        return Stream.of(current, extra)
                .filter(v -> v != null && !v.isBlank())
                .reduce((left, right) -> left + " · " + right)
                .orElse(null);
    }

    private static void applyCommercialSnapshotToPendingItem(PendingOrderItem item, CommercialLineSnapshotDto snap) {
        if (snap == null) {
            return;
        }
        item.setLineGrossAmount(snap.lineGrossAmount());
        item.setLineOwnDiscountAmount(snap.lineOwnDiscountAmount());
        item.setLineNetBeforeInvoiceDiscount(snap.lineNetBeforeInvoiceDiscount());
        item.setAllocatedManualDiscount(snap.allocatedManualDiscount());
        item.setAllocatedPromotionDiscount(snap.allocatedPromotionDiscount());
        item.setAllocatedVoucherDiscount(snap.allocatedVoucherDiscount());
        item.setAllocatedLoyaltyDiscount(snap.allocatedLoyaltyDiscount());
        item.setAllocatedMerchandiseDiscount(snap.allocatedMerchandiseDiscount());
        item.setLineNetRevenue(snap.lineNetRevenue());
        item.setLineVatBase(snap.lineVatBase());
        item.setLineVatAmount(snap.lineVatAmount());
        item.setCommercialAllocationVersion(snap.commercialAllocationVersion());
    }

    private PendingOrder.Status parseStatus(String raw) {
        String normalized = normalizeBlank(raw);
        if (normalized == null) {
            return null;
        }
        String enumName = normalized.trim().toUpperCase(Locale.ROOT);
        try {
            return PendingOrder.Status.valueOf(enumName);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("status không hợp lệ: " + raw);
        }
    }

    private Pageable sanitizePageable(Integer page, Integer size, Pageable pageable) {
        int safePage = page != null ? Math.max(0, page) : Math.max(0, pageable.getPageNumber());
        int requestedSize = size != null ? size : pageable.getPageSize();
        int safeSize = Math.min(Math.max(1, requestedSize), 100);
        Sort safeSort = Sort.unsorted();
        for (Sort.Order order : pageable.getSort()) {
            if (PENDING_ORDER_SORT_WHITELIST.contains(order.getProperty())) {
                safeSort = safeSort.and(Sort.by(order));
            }
        }
        if (safeSort.isUnsorted()) {
            safeSort = Sort.by(Sort.Order.desc("createdAt"));
        }
        return PageRequest.of(safePage, safeSize, safeSort);
    }

    private String normalizeBlank(String input) {
        if (input == null || input.isBlank()) {
            return null;
        }
        return input.trim();
    }

    private Specification<PendingOrder> buildAdminListSpec(
            PendingOrder.Status status,
            String paymentMethod,
            String search) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (status != null) {
                predicates.add(cb.equal(root.get("status"), status));
            }
            if (paymentMethod != null) {
                predicates.add(cb.equal(
                        cb.upper(cb.coalesce(root.get("paymentMethod"), "")),
                        paymentMethod.toUpperCase(Locale.ROOT)));
            }
            if (search != null) {
                String likePattern = "%" + search.toUpperCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.upper(cb.coalesce(root.get("orderNo"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("customerName"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("customerPhone"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("paymentReference"), "")), likePattern)
                ));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }
}
