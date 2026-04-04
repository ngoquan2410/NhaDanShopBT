package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

@Service
@RequiredArgsConstructor
public class PendingOrderService {

    private final PendingOrderRepository pendingOrderRepo;
    private final ProductRepository productRepo;
    private final UserRepository userRepo;
    private final InvoiceService invoiceService;
    private final ProductVariantService variantService; // Sprint 0

    // ── Order number generator (format: ORD-YYYYMMDD-XXXXX) ──────────────────
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
        return "ORD-" + today + "-" + String.format("%05d", orderSeq.incrementAndGet());
    }

    // ── Tạo đơn chờ ──────────────────────────────────────────────────────────
    @Transactional
    public PendingOrderResponse createOrder(PendingOrderRequest req) {
        PendingOrder order = new PendingOrder();
        order.setOrderNo(nextOrderNo());
        order.setCustomerName(req.customerName());
        order.setNote(req.note());
        order.setPaymentMethod(req.paymentMethod());
        order.setStatus(PendingOrder.Status.PENDING);
        order.setExpiresAt(LocalDateTime.now().plusMinutes(15));

        String currentUsername = SecurityContextHolder.getContext().getAuthentication().getName();
        userRepo.findByUsername(currentUsername).ifPresent(order::setCreatedBy);

        BigDecimal total = BigDecimal.ZERO;
        for (InvoiceItemRequest itemReq : req.items()) {
            Product product = productRepo.findById(itemReq.productId())
                    .orElseThrow(() -> new EntityNotFoundException(
                            "Không tìm thấy sản phẩm ID: " + itemReq.productId()));

            if (!product.getActive()) {
                throw new IllegalArgumentException(
                        "Sản phẩm '" + product.getName() + "' đã ngừng kinh doanh");
            }
            // [Sprint 0] Resolve variant — null → default variant
            var variant = variantService.resolveVariant(itemReq.variantId(), product.getId());
            // Kiểm tra tồn kho theo variant
            if (variant.getStockQty() < itemReq.quantity()) {
                throw new IllegalArgumentException(
                        "Sản phẩm '" + product.getName() + "' [" + variant.getVariantCode() + "] không đủ hàng. " +
                        "Tồn kho: " + variant.getStockQty() + ", yêu cầu: " + itemReq.quantity());
            }

            PendingOrderItem item = new PendingOrderItem();
            item.setPendingOrder(order);
            item.setProduct(product);
            item.setVariant(variant); // [Sprint 0]
            item.setQuantity(itemReq.quantity());
            item.setUnitPrice(variant.getSellPrice());

            total = total.add(variant.getSellPrice()
                    .multiply(BigDecimal.valueOf(itemReq.quantity())));
            order.getItems().add(item);
        }

        order.setTotalAmount(total);
        return toResponse(pendingOrderRepo.save(order));
    }

    // ── Lấy danh sách (admin) ─────────────────────────────────────────────────
    @Transactional
    public List<PendingOrderResponse> listAll() {
        return pendingOrderRepo.findAllByOrderByCreatedAtDesc()
                .stream().map(this::toResponse).toList();
    }

    // ── Lấy 1 đơn (khách polling) ────────────────────────────────────────────
    @Transactional
    public PendingOrderResponse getById(Long id) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));
        return toResponse(order);
    }

    // ── Admin xác nhận đã nhận tiền → tạo invoice + trừ kho ─────────────────
    @Transactional
    public PendingOrderResponse confirmOrder(Long id) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));

        if (order.getStatus() != PendingOrder.Status.PENDING) {
            throw new IllegalStateException(
                    "Đơn hàng " + order.getOrderNo() + " không ở trạng thái PENDING");
        }

        // Tạo invoice thật sự (trừ kho)
        SalesInvoiceRequest invoiceReq = new SalesInvoiceRequest(
                order.getCustomerName(),
                "[" + order.getPaymentMethod() + "] " + (order.getNote() != null ? order.getNote() : ""),
                null,
                order.getItems().stream()
                        .map(i -> new InvoiceItemRequest(
                                i.getProduct().getId(),
                                i.getQuantity(),
                                null,
                                i.getVariant() != null ? i.getVariant().getId() : null)) // [Sprint 0]
                        .toList()
        );
        SalesInvoiceResponse invoice = invoiceService.createInvoice(invoiceReq);

        // Cập nhật trạng thái
        order.setStatus(PendingOrder.Status.CONFIRMED);
        // Lưu reference invoice vào pending order để FE có thể lấy
        // (dùng proxy bằng id)
        pendingOrderRepo.save(order);

        // Trả về response kèm invoice
        PendingOrderResponse resp = toResponse(order);
        // Override invoice trong response
        return new PendingOrderResponse(
                resp.id(), resp.orderNo(), resp.customerName(), resp.note(),
                resp.paymentMethod(), resp.status(), resp.cancelReason(),
                resp.totalAmount(), resp.expiresAt(), resp.createdAt(),
                resp.updatedAt(), resp.createdBy(), resp.items(), invoice
        );
    }

    // ── Hủy đơn ──────────────────────────────────────────────────────────────
    @Transactional
    public PendingOrderResponse cancelOrder(Long id, String reason) {
        PendingOrder order = pendingOrderRepo.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy đơn hàng ID: " + id));

        if (order.getStatus() != PendingOrder.Status.PENDING) {
            throw new IllegalStateException(
                    "Đơn hàng " + order.getOrderNo() + " không ở trạng thái PENDING");
        }

        order.setStatus(PendingOrder.Status.CANCELLED);
        order.setCancelReason(reason);
        return toResponse(pendingOrderRepo.save(order));
    }

    // ── Scheduler: tự hủy đơn quá hạn mỗi 2 phút ────────────────────────────
    @Scheduled(fixedDelay = 120_000)
    @Transactional
    public void cancelExpiredOrders() {
        List<PendingOrder> expired = pendingOrderRepo.findByStatusAndExpiresAtBefore(
                PendingOrder.Status.PENDING, LocalDateTime.now());
        for (PendingOrder order : expired) {
            order.setStatus(PendingOrder.Status.CANCELLED);
            order.setCancelReason("Hết hạn xác nhận (15 phút)");
            pendingOrderRepo.save(order);
        }
    }

    // ── Mapper ───────────────────────────────────────────────────────────────
    private PendingOrderResponse toResponse(PendingOrder order) {
        List<PendingOrderItemResponse> items = order.getItems().stream()
                .map(i -> {
                    var v = i.getVariant();
                    String unit = v != null ? v.getSellUnit()
                            : (i.getProduct().getSellUnit() != null
                                ? i.getProduct().getSellUnit() : i.getProduct().getUnit());
                    return new PendingOrderItemResponse(
                            i.getProduct().getId(),
                            i.getProduct().getName(),
                            unit,
                            i.getQuantity(),
                            i.getUnitPrice(),
                            i.getUnitPrice().multiply(BigDecimal.valueOf(i.getQuantity())),
                            v != null ? v.getId()          : null,
                            v != null ? v.getVariantCode() : i.getProduct().getCode(),
                            v != null ? v.getVariantName() : i.getProduct().getName(),
                            v != null ? v.getSellUnit()    : null
                    );
                }).toList();

        return new PendingOrderResponse(
                order.getId(),
                order.getOrderNo(),
                order.getCustomerName(),
                order.getNote(),
                order.getPaymentMethod(),
                order.getStatus().name(),
                order.getCancelReason(),
                order.getTotalAmount(),
                order.getExpiresAt(),
                order.getCreatedAt(),
                order.getUpdatedAt(),
                order.getCreatedBy() != null ? order.getCreatedBy().getUsername() : null,
                items,
                order.getInvoice() != null ? DtoMapper.toResponse(order.getInvoice()) : null
        );
    }
}
