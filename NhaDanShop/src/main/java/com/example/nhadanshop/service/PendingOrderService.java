package com.example.nhadanshop.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.stream.Stream;

@Service
@RequiredArgsConstructor
public class PendingOrderService {

    private final PendingOrderRepository pendingOrderRepo;
    private final SalesInvoiceRepository salesInvoiceRepo;
    private final ProductRepository productRepo;
    private final UserRepository userRepo;
    private final InvoiceService invoiceService;
    private final ProductVariantService variantService; // Sprint 0
    private final ObjectMapper objectMapper;
    private final CustomerRepository customerRepository;
    private final PromotionRepository promotionRepository;
    private final VoucherRepository voucherRepository;

    private static final Set<String> ONLINE_PAYMENT_METHODS = Set.of("bank_transfer", "momo", "zalopay");
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
        if (!ONLINE_PAYMENT_METHODS.contains(req.paymentMethod())) {
            throw new IllegalArgumentException("Pending order chỉ hỗ trợ bank_transfer, momo, zalopay");
        }
        if (req.lines() == null || req.lines().isEmpty()) {
            throw new IllegalArgumentException("Đơn hàng phải có ít nhất 1 dòng sản phẩm");
        }
        if (req.pricingBreakdownSnapshot() == null) {
            throw new IllegalArgumentException("Thiếu pricingBreakdownSnapshot");
        }

        Long boundCustomerId = parseNullableLong(req.customerId());
        if (boundCustomerId != null) {
            customerRepository.findById(boundCustomerId).ifPresent(
                    c -> ActiveEntityGuards.requireActiveCustomerForBinding(c, boundCustomerId));
        }

        if (req.promotionSnapshot() != null) {
            Long promotionId = parseNullableLong(req.promotionSnapshot().promotionId());
            if (promotionId != null) {
                Promotion pr = promotionRepository.findById(promotionId)
                        .orElseThrow(() -> new IllegalArgumentException(
                                "Không tìm thấy khuyến mãi ID: " + promotionId));
                if (!pr.isCurrentlyActive()) {
                    throw new IllegalStateException(
                            "Chương trình khuyến mãi không còn hiệu lực hoặc đã tắt (ID: " + promotionId + ")");
                }
            }
        }
        if (req.voucherSnapshot() != null
                && req.voucherSnapshot().code() != null
                && !req.voucherSnapshot().code().isBlank()) {
            String c = req.voucherSnapshot().code().trim();
            voucherRepository.findByCodeIgnoreCase(c).ifPresent(v -> {
                if (!Boolean.TRUE.equals(v.getActive())) {
                    throw new IllegalStateException("Mã voucher đã bị vô hiệu hóa: " + c);
                }
            });
        }

        PendingOrder order = new PendingOrder();
        order.setOrderNo(nextOrderNo());
        order.setCustomerId(req.customerId());
        order.setCustomerName(req.customerName());
        order.setCustomerPhone(req.customerPhone());
        order.setNote(req.note());
        order.setPaymentMethod(req.paymentMethod());
        order.setPaymentReference(order.getOrderNo());
        order.setStatus(PendingOrder.Status.PENDING_PAYMENT);
        order.setExpiresAt(req.expiresAt() != null ? req.expiresAt() : LocalDateTime.now().plusHours(12));
        order.setShippingAddressJson(writeJson(req.shippingAddress()));
        order.setGiftLinesSnapshotJson(writeJson(req.promotionSnapshot() != null ? safeList(req.promotionSnapshot().giftLines()) : List.of()));
        order.setPromotionSnapshotJson(writeJson(req.promotionSnapshot()));
        order.setVoucherSnapshotJson(writeJson(req.voucherSnapshot()));
        order.setShippingQuoteSnapshotJson(writeJson(req.shippingQuoteSnapshot()));
        order.setPricingBreakdownSnapshotJson(writeJson(req.pricingBreakdownSnapshot()));
        order.setTotalAmount(nvl(req.pricingBreakdownSnapshot().total()));

        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.isAuthenticated()
                && authentication.getName() != null
                && !"anonymousUser".equals(authentication.getName())) {
            userRepo.findByUsername(authentication.getName()).ifPresent(order::setCreatedBy);
        }

        for (PendingOrderLineRequest itemReq : req.lines()) {
            Long productId = parseLongId(itemReq.productId(), "productId");
            Long variantId = parseLongId(itemReq.variantId(), "variantId");

            Product product = productRepo.findById(productId)
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Không tìm thấy sản phẩm ID: " + itemReq.productId()));

            if (!product.getActive()) {
                throw new IllegalArgumentException(
                        "Sản phẩm '" + product.getName() + "' đã ngừng kinh doanh");
            }
            var variant = variantService.resolveVariant(variantId, product.getId(), true);
            if (variant.getStockQty() < itemReq.qty()) {
                throw new IllegalArgumentException(
                        "Sản phẩm '" + product.getName() + "' [" + variant.getVariantCode() + "] không đủ hàng. " +
                        "Tồn kho: " + variant.getStockQty() + ", yêu cầu: " + itemReq.qty());
            }

            PendingOrderItem item = new PendingOrderItem();
            item.setPendingOrder(order);
            item.setProduct(product);
            item.setVariant(variant);
            item.setLineId(itemReq.id());
            item.setProductNameSnapshot(itemReq.productName());
            item.setVariantNameSnapshot(itemReq.variantName());
            item.setQuantity(itemReq.qty());
            item.setUnitPrice(nvl(itemReq.unitPrice()));
            item.setLineSubtotal(nvl(itemReq.lineSubtotal()));
            order.getItems().add(item);
        }

        return toResponse(pendingOrderRepo.save(order));
    }

    @Transactional
    public List<PendingOrderResponse> listAll() {
        return pendingOrderRepo.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toResponse).toList();
    }

    @Transactional
    public PendingOrderResponse getById(Long id) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));
        return toResponse(order);
    }

    @Transactional
    public PendingOrderResponse getByCode(String code) {
        PendingOrder order = pendingOrderRepo.findByOrderNo(code)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng mã: " + code));
        return toResponse(order);
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
            throw new IllegalArgumentException("Chỉ hỗ trợ bank_transfer, momo, zalopay");
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
        PendingOrder order = pendingOrderRepo.findById(id)
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
            return new PendingOrderConfirmResponse(pendingOrder, DtoMapper.toResponse(existingInvoice));
        }

        if (order.getStatus() != PendingOrder.Status.PENDING_PAYMENT
                && order.getStatus() != PendingOrder.Status.WAITING_CONFIRM
                && order.getStatus() != PendingOrder.Status.PAID_AUTO) {
            throw new IllegalStateException(
                    "Đơn hàng " + order.getOrderNo() + " không ở trạng thái có thể xác nhận");
        }

        order.setNote(appendNote(order.getNote(), note));
        SalesInvoice invoice = invoiceService.createInvoiceFromPendingOrder(order, confirmedBy);
        order.setInvoice(invoice);
        order.setStatus(PendingOrder.Status.CONFIRMED);
        pendingOrderRepo.save(order);

        PendingOrderResponse pendingOrder = toResponse(order);
        return new PendingOrderConfirmResponse(pendingOrder, DtoMapper.toResponse(invoice));
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
        return toResponse(pendingOrderRepo.save(order));
    }

    @Scheduled(fixedDelay = 120_000)
    @Transactional
    public void cancelExpiredOrders() {
        List<PendingOrder> expired = pendingOrderRepo.findByStatusAndExpiresAtBefore(
                PendingOrder.Status.PENDING_PAYMENT, LocalDateTime.now());
        for (PendingOrder order : expired) {
            order.setStatus(PendingOrder.Status.CANCELLED);
            order.setCancelReason("Hết hạn xác nhận");
            pendingOrderRepo.save(order);
        }
    }

    private PendingOrderResponse toResponse(PendingOrder order) {
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
                        i.getLineSubtotal()
                )).toList();

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
                order.getInvoice() != null ? DtoMapper.toResponse(order.getInvoice()) : null
        );
    }

    private boolean isTerminal(PendingOrder order) {
        return order.getStatus() == PendingOrder.Status.CONFIRMED
                || order.getStatus() == PendingOrder.Status.CANCELLED;
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
}
