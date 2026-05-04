package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.*;
import com.example.nhadanshop.entity.*;
import com.example.nhadanshop.repository.*;
import jakarta.persistence.EntityNotFoundException;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class CustomerLoyaltyService {
    private final CustomerRepository customerRepository;
    private final CustomerPointTransactionRepository transactionRepository;
    private final CustomerPointReservationRepository reservationRepository;
    private final LoyaltySettingsRepository settingsRepository;
    private final Clock clock;

    public LoyaltySettings getSettingsEntity() {
        return settingsRepository.findById(1L).orElseGet(() -> {
            LoyaltySettings s = new LoyaltySettings();
            s.setId(1L);
            return settingsRepository.save(s);
        });
    }

    public LoyaltySettingsResponse settings() {
        LoyaltySettings s = getSettingsEntity();
        return new LoyaltySettingsResponse(Boolean.TRUE.equals(s.getEnabled()), s.getEarnMoneyAmount(), s.getEarnPoints(),
                s.getRedeemValuePerPoint(), s.getMinimumRedeemPoints(), s.getMaxRedeemPercent());
    }

    public CustomerPointsSummaryResponse summary(Customer customer) {
        long balance = nz(customer.getPointBalance());
        long reserved = nz(customer.getPointReserved());
        return new CustomerPointsSummaryResponse(customer.getId(), balance, reserved,
                Math.max(0, balance - reserved), nz(customer.getLifetimePointsEarned()), nz(customer.getLifetimePointsRedeemed()));
    }

    public CustomerPointsSummaryResponse summary(Long customerId) {
        return summary(customerRepository.findById(customerId)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khách hàng ID: " + customerId)));
    }

    public Page<CustomerPointTransactionResponse> history(Long customerId, Pageable pageable) {
        return transactionRepository.findByCustomerIdOrderByCreatedAtDesc(customerId, pageable).map(this::toResponse);
    }

    public LoyaltyRedemptionSnapshotDto capRedemption(Customer customer, Long requestedPoints, BigDecimal maxDiscountBase) {
        long requested = requestedPoints != null ? requestedPoints : 0L;
        if (requested <= 0) {
            return null;
        }
        LoyaltySettings s = getSettingsEntity();
        if (!Boolean.TRUE.equals(s.getEnabled())) {
            return new LoyaltyRedemptionSnapshotDto(customer.getId(), requested, 0L, BigDecimal.ZERO,
                    Math.max(0, nz(customer.getPointBalance()) - nz(customer.getPointReserved())), "disabled");
        }
        long available = Math.max(0, nz(customer.getPointBalance()) - nz(customer.getPointReserved()));
        BigDecimal cap = maxDiscountBase != null ? maxDiscountBase.max(BigDecimal.ZERO) : BigDecimal.ZERO;
        if (s.getMaxRedeemPercent() != null) {
            BigDecimal pctCap = cap.multiply(s.getMaxRedeemPercent()).divide(BigDecimal.valueOf(100), 0, RoundingMode.FLOOR);
            cap = cap.min(pctCap);
        }
        BigDecimal value = s.getRedeemValuePerPoint() != null ? s.getRedeemValuePerPoint() : BigDecimal.ONE;
        long pointsByCap = value.compareTo(BigDecimal.ZERO) > 0
                ? cap.divide(value, 0, RoundingMode.FLOOR).longValue()
                : 0L;
        long minimum = s.getMinimumRedeemPoints() != null ? s.getMinimumRedeemPoints() : 1L;
        long redeemed = Math.min(Math.min(requested, available), pointsByCap);
        if (redeemed < minimum) redeemed = 0L;
        BigDecimal discount = BigDecimal.valueOf(redeemed).multiply(value).setScale(0, RoundingMode.FLOOR);
        return new LoyaltyRedemptionSnapshotDto(customer.getId(), requested, redeemed, discount, available,
                "1 point = " + value.stripTrailingZeros().toPlainString() + "đ");
    }

    @Transactional
    public void reserveForPendingOrder(PendingOrder order, LoyaltyRedemptionSnapshotDto snapshot) {
        if (snapshot == null || snapshot.redeemedPoints() == null || snapshot.redeemedPoints() <= 0) return;
        if (reservationRepository.findByPendingOrderId(order.getId()).isPresent()) return;
        Customer customer = customerRepository.findByIdForUpdate(snapshot.customerId())
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy khách hàng loyalty"));
        long available = Math.max(0, nz(customer.getPointBalance()) - nz(customer.getPointReserved()));
        if (available < snapshot.redeemedPoints()) {
            throw new IllegalStateException("Không đủ điểm khả dụng để đặt giữ");
        }
        customer.setPointReserved(nz(customer.getPointReserved()) + snapshot.redeemedPoints());
        customerRepository.save(customer);

        CustomerPointReservation r = new CustomerPointReservation();
        r.setCustomer(customer);
        r.setQuotePublicId(order.getQuotePublicId());
        r.setPendingOrder(order);
        r.setPoints(snapshot.redeemedPoints());
        r.setDiscountAmount(snapshot.discountAmount());
        r.setExpiresAt(order.getExpiresAt());
        reservationRepository.save(r);
        writeTx(customer, CustomerPointTransaction.Type.RESERVE, 0L, null, order, r,
                null, snapshot.discountAmount(), "Reserve points for pending order", "pending_order", "reserve:pending:" + order.getId());
    }

    @Transactional
    public void redeemForPendingOrder(PendingOrder order, SalesInvoice invoice, String actor) {
        CustomerPointReservation r = reservationRepository.findByPendingOrderIdForUpdate(order.getId()).orElse(null);
        if (r == null || r.getStatus() == CustomerPointReservation.Status.REDEEMED) return;
        if (r.getStatus() != CustomerPointReservation.Status.RESERVED) return;
        Customer customer = customerRepository.findByIdForUpdate(r.getCustomer().getId()).orElseThrow();
        customer.setPointReserved(Math.max(0, nz(customer.getPointReserved()) - nz(r.getPoints())));
        customer.setPointBalance(Math.max(0, nz(customer.getPointBalance()) - nz(r.getPoints())));
        customer.setLifetimePointsRedeemed(nz(customer.getLifetimePointsRedeemed()) + nz(r.getPoints()));
        customerRepository.save(customer);
        r.setStatus(CustomerPointReservation.Status.REDEEMED);
        r.setRedeemedAt(LocalDateTime.now(clock));
        r.setInvoice(invoice);
        reservationRepository.save(r);
        invoice.setLoyaltyDiscountAmount(r.getDiscountAmount());
        invoice.setLoyaltyRedeemedPoints(r.getPoints());
        writeTx(customer, CustomerPointTransaction.Type.REDEEM, -nz(r.getPoints()), invoice, order, r,
                null, r.getDiscountAmount(), "Redeem points", actor, "redeem:pending:" + order.getId());
    }

    @Transactional
    public void releaseForPendingOrder(PendingOrder order, CustomerPointReservation.Status targetStatus) {
        CustomerPointReservation r = reservationRepository.findByPendingOrderIdForUpdate(order.getId()).orElse(null);
        if (r == null || r.getStatus() != CustomerPointReservation.Status.RESERVED) return;
        Customer customer = customerRepository.findByIdForUpdate(r.getCustomer().getId()).orElseThrow();
        customer.setPointReserved(Math.max(0, nz(customer.getPointReserved()) - nz(r.getPoints())));
        customerRepository.save(customer);
        r.setStatus(targetStatus);
        r.setReleasedAt(LocalDateTime.now(clock));
        reservationRepository.save(r);
        writeTx(customer, targetStatus == CustomerPointReservation.Status.EXPIRED ? CustomerPointTransaction.Type.EXPIRE : CustomerPointTransaction.Type.RELEASE,
                0L, null, order, r, null, r.getDiscountAmount(), "Release point reservation", "pending_order",
                "release:pending:" + order.getId());
    }

    @Transactional
    public void expireReservation(CustomerPointReservation r) {
        if (r.getPendingOrder() != null) releaseForPendingOrder(r.getPendingOrder(), CustomerPointReservation.Status.EXPIRED);
    }

    @Transactional
    public void earnForInvoice(SalesInvoice invoice) {
        if (invoice == null || invoice.getId() == null || invoice.getCustomer() == null || invoice.isCancelled()) return;
        String key = "earn:invoice:" + invoice.getId();
        if (transactionRepository.existsByIdempotencyKey(key)) return;
        LoyaltySettings s = getSettingsEntity();
        if (!Boolean.TRUE.equals(s.getEnabled())) return;
        BigDecimal base = invoice.getItems().stream()
                .filter(i -> !i.isRewardLine())
                .map(this::earnBaseForItem)
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .max(BigDecimal.ZERO);
        if (base.compareTo(BigDecimal.ZERO) <= 0) return;
        BigDecimal earnMoney = s.getEarnMoneyAmount() != null ? s.getEarnMoneyAmount() : BigDecimal.valueOf(1000);
        long points = earnMoney.compareTo(BigDecimal.ZERO) > 0
                ? base.divide(earnMoney, 0, RoundingMode.FLOOR).longValue() * nz(s.getEarnPoints())
                : 0L;
        if (points <= 0) return;
        Customer customer = customerRepository.findByIdForUpdate(invoice.getCustomer().getId()).orElseThrow();
        customer.setPointBalance(nz(customer.getPointBalance()) + points);
        customer.setLifetimePointsEarned(nz(customer.getLifetimePointsEarned()) + points);
        customerRepository.save(customer);
        writeTx(customer, CustomerPointTransaction.Type.EARN, points, invoice, null, null,
                base, null, "Earn points from invoice", "invoice", key);
    }

    @Transactional
    public void reverseForInvoice(SalesInvoice invoice, String reason) {
        if (invoice == null || invoice.getId() == null || invoice.getCustomer() == null) return;
        String earnKey = "earn:invoice:" + invoice.getId();
        String reverseKey = "reverse:earn:invoice:" + invoice.getId();
        if (transactionRepository.existsByIdempotencyKey(reverseKey)) return;
        CustomerPointTransaction earn = transactionRepository.findByIdempotencyKey(earnKey).orElse(null);
        if (earn == null || earn.getPointsDelta() == null || earn.getPointsDelta() <= 0) return;
        Customer customer = customerRepository.findByIdForUpdate(invoice.getCustomer().getId()).orElseThrow();
        long earnDelta = nz(earn.getPointsDelta());
        customer.setPointBalance(nz(customer.getPointBalance()) - earnDelta);
        // Original EARN row stays immutable; lifetime earned stays historical gross (not reduced here).
        customerRepository.save(customer);
        writeTx(customer, CustomerPointTransaction.Type.ADJUST, -earnDelta, invoice, null, null,
                earn.getMoneyBase(), null,
                reason != null && !reason.isBlank() ? reason : "Reverse earned points for cancelled invoice",
                "invoice_cancel", reverseKey);
    }

    private BigDecimal earnBaseForItem(SalesInvoiceItem item) {
        if (item.getLineNetRevenue() != null) {
            return item.getLineNetRevenue().max(BigDecimal.ZERO);
        }
        BigDecimal qty = BigDecimal.valueOf(item.getQuantity() != null ? item.getQuantity() : 0);
        BigDecimal gross = item.getLineGrossAmount() != null
                ? item.getLineGrossAmount()
                : nbd(item.getOriginalUnitPrice()).multiply(qty);
        if (gross.compareTo(BigDecimal.ZERO) <= 0) {
            gross = nbd(item.getUnitPrice()).multiply(qty);
        }
        BigDecimal ownDiscount = item.getLineOwnDiscountAmount() != null
                ? item.getLineOwnDiscountAmount()
                : gross.subtract(nbd(item.getUnitPrice()).multiply(qty)).max(BigDecimal.ZERO);
        BigDecimal allocated = item.getAllocatedMerchandiseDiscount() != null
                ? item.getAllocatedMerchandiseDiscount()
                : nbd(item.getAllocatedManualDiscount())
                .add(nbd(item.getAllocatedPromotionDiscount()))
                .add(nbd(item.getAllocatedVoucherDiscount()))
                .add(nbd(item.getAllocatedLoyaltyDiscount()));
        return gross.subtract(ownDiscount).subtract(allocated).max(BigDecimal.ZERO);
    }

    private void writeTx(Customer customer, CustomerPointTransaction.Type type, Long delta, SalesInvoice invoice,
                         PendingOrder order, CustomerPointReservation reservation, BigDecimal moneyBase,
                         BigDecimal discountAmount, String reason, String source, String key) {
        if (transactionRepository.existsByIdempotencyKey(key)) return;
        CustomerPointTransaction tx = new CustomerPointTransaction();
        tx.setCustomer(customer);
        tx.setType(type);
        tx.setPointsDelta(delta);
        tx.setBalanceAfter(nz(customer.getPointBalance()));
        tx.setReservedAfter(nz(customer.getPointReserved()));
        tx.setInvoice(invoice);
        tx.setPendingOrder(order);
        tx.setReservation(reservation);
        tx.setMoneyBase(moneyBase);
        tx.setDiscountAmount(discountAmount);
        tx.setReason(reason);
        tx.setSource(source);
        tx.setIdempotencyKey(key);
        transactionRepository.save(tx);
    }

    private CustomerPointTransactionResponse toResponse(CustomerPointTransaction tx) {
        return new CustomerPointTransactionResponse(tx.getId(), tx.getType().name(), tx.getPointsDelta(), tx.getBalanceAfter(),
                tx.getReservedAfter(), tx.getMoneyBase(), tx.getDiscountAmount(), tx.getReason(), tx.getSource(),
                tx.getInvoice() != null ? tx.getInvoice().getId() : null,
                tx.getPendingOrder() != null ? tx.getPendingOrder().getId() : null,
                tx.getCreatedAt());
    }

    private long nz(Long v) { return v != null ? v : 0L; }
    private BigDecimal nbd(BigDecimal v) { return v != null ? v : BigDecimal.ZERO; }
}
