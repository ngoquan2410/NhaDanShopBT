package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.VoucherRequest;
import com.example.nhadanshop.dto.VoucherResponse;
import com.example.nhadanshop.entity.Voucher;
import com.example.nhadanshop.repository.VoucherRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import jakarta.persistence.criteria.Predicate;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Transactional
public class VoucherService {

    private final VoucherRepository voucherRepository;
    private final Clock businessClock;
    private static final Set<String> VOUCHER_SORT_WHITELIST = Set.of(
            "createdAt", "updatedAt", "code", "startAt", "endAt", "active", "minSubtotal", "percent", "fixedAmount");

    public VoucherResponse create(VoucherRequest req) {
        if (voucherRepository.findByCodeIgnoreCase(req.code().trim()).isPresent()) {
            throw new IllegalArgumentException("Mã voucher đã tồn tại: " + req.code().trim());
        }
        Voucher v = new Voucher();
        applyRequest(v, req, true);
        return toResponse(voucherRepository.save(v));
    }

    public VoucherResponse update(Long id, VoucherRequest req) {
        Voucher v = voucherRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy voucher ID: " + id));
        String newCode = req.code().trim();
        if (!v.getCode().equalsIgnoreCase(newCode)) {
            voucherRepository.findByCodeIgnoreCase(newCode).ifPresent(o -> {
                if (!o.getId().equals(id)) {
                    throw new IllegalArgumentException("Mã voucher đã tồn tại: " + newCode);
                }
            });
        }
        applyRequest(v, req, false);
        return toResponse(voucherRepository.save(v));
    }

    public VoucherResponse getOne(Long id) {
        return toResponse(voucherRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy voucher ID: " + id)));
    }

    public Page<VoucherResponse> list(
            Integer page,
            Integer size,
            String search,
            String status,
            Pageable pageable) {
        Pageable safePageable = sanitizePageable(page, size, pageable);
        String normalizedSearch = normalizeBlank(search);
        String normalizedStatus = normalizeStatus(status);
        return voucherRepository.findAll(buildAdminListSpec(normalizedSearch, normalizedStatus), safePageable)
                .map(this::toResponse);
    }

    public List<VoucherResponse> listActive() {
        LocalDateTime now = LocalDateTime.now(businessClock);
        return voucherRepository.findAll(buildCurrentlyActiveSpec(now), Sort.by(Sort.Order.asc("code"))).stream()
                .map(this::toResponse)
                .toList();
    }

    /**
     * If the voucher is referenced in any order/invoice JSON snapshot, archive (is_active = false) instead
     * of physical delete. Otherwise perform delete.
     */
    public void delete(Long id) {
        Voucher v = voucherRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy voucher ID: " + id));
        if (voucherRepository.isVoucherCodeUsedInAnySnapshot(v.getCode()) || "expired".equals(effectiveStatus(v))) {
            v.setActive(false);
            voucherRepository.save(v);
            return;
        }
        voucherRepository.delete(v);
    }

    public VoucherResponse toggleActive(Long id) {
        Voucher v = voucherRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy voucher ID: " + id));
        v.setActive(!Boolean.TRUE.equals(v.getActive()));
        return toResponse(voucherRepository.save(v));
    }

    private void applyRequest(Voucher v, VoucherRequest req, boolean isCreate) {
        v.setCode(req.code().trim());
        v.setRuleSummary(req.ruleSummary() == null || req.ruleSummary().isBlank()
                ? null : req.ruleSummary().trim());
        if (req.active() != null) {
            v.setActive(req.active());
        } else if (isCreate) {
            v.setActive(true);
        }
        if (req.minSubtotal() != null) {
            v.setMinSubtotal(req.minSubtotal());
        } else if (isCreate) {
            v.setMinSubtotal(BigDecimal.ZERO);
        }
        if (req.percent() != null) {
            v.setPercent(req.percent());
        } else if (isCreate) {
            v.setPercent(BigDecimal.ZERO);
        }
        if (req.cap() != null) {
            v.setCap(req.cap());
        } else if (isCreate) {
            v.setCap(BigDecimal.ZERO);
        }
        if (req.fixedAmount() != null) {
            v.setFixedAmount(req.fixedAmount());
        } else if (isCreate) {
            v.setFixedAmount(BigDecimal.ZERO);
        }
        if (req.freeShipping() != null) {
            v.setFreeShipping(req.freeShipping());
        } else if (isCreate) {
            v.setFreeShipping(false);
        }
        if (req.startAt() != null || isCreate) {
            v.setStartAt(req.startAt());
        }
        if (req.endAt() != null || isCreate) {
            v.setEndAt(req.endAt());
        }
    }

    private VoucherResponse toResponse(Voucher v) {
        return new VoucherResponse(
                v.getId(),
                v.getCode(),
                v.getRuleSummary(),
                Boolean.TRUE.equals(v.getActive()),
                nvl(v.getMinSubtotal()),
                nvl(v.getPercent()),
                nvl(v.getCap()),
                nvl(v.getFixedAmount()),
                Boolean.TRUE.equals(v.getFreeShipping()),
                v.getStartAt(),
                v.getEndAt(),
                effectiveStatus(v),
                currentlyActive(v),
                v.getCreatedAt(),
                v.getUpdatedAt()
        );
    }

    public String effectiveStatus(Voucher v) {
        if (!Boolean.TRUE.equals(v.getActive())) {
            return "inactive";
        }
        LocalDateTime now = LocalDateTime.now(businessClock);
        if (v.getStartAt() != null && now.isBefore(v.getStartAt())) {
            return "scheduled";
        }
        if (v.getEndAt() != null && now.isAfter(v.getEndAt())) {
            return "expired";
        }
        return "running";
    }

    private boolean currentlyActive(Voucher v) {
        return "running".equals(effectiveStatus(v));
    }

    private static BigDecimal nvl(BigDecimal b) {
        return b == null ? BigDecimal.ZERO : b;
    }

    private Pageable sanitizePageable(Integer page, Integer size, Pageable pageable) {
        int safePage = page != null ? Math.max(0, page) : Math.max(0, pageable.getPageNumber());
        int requestedSize = size != null ? size : pageable.getPageSize();
        int safeSize = Math.min(Math.max(1, requestedSize), 100);
        Sort safeSort = Sort.unsorted();
        for (Sort.Order order : pageable.getSort()) {
            if (VOUCHER_SORT_WHITELIST.contains(order.getProperty())) {
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

    private String normalizeStatus(String input) {
        String normalized = normalizeBlank(input);
        if (normalized == null) {
            return null;
        }
        String lower = normalized.toLowerCase(Locale.ROOT);
        return switch (lower) {
            case "all", "active", "running", "scheduled", "expired", "inactive", "archived" -> lower;
            default -> throw new IllegalArgumentException("status không hợp lệ: " + input);
        };
    }

    private Specification<Voucher> buildAdminListSpec(String search, String status) {
        return (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            if (status != null && !"all".equals(status)) {
                LocalDateTime now = LocalDateTime.now(businessClock);
                if ("active".equals(status)) {
                    predicates.add(cb.isTrue(root.get("active")));
                } else if ("inactive".equals(status) || "archived".equals(status)) {
                    predicates.add(cb.isFalse(root.get("active")));
                } else if ("running".equals(status)) {
                    predicates.add(cb.isTrue(root.get("active")));
                    predicates.add(cb.or(root.get("startAt").isNull(), cb.lessThanOrEqualTo(root.<LocalDateTime>get("startAt"), now)));
                    predicates.add(cb.or(root.get("endAt").isNull(), cb.greaterThanOrEqualTo(root.<LocalDateTime>get("endAt"), now)));
                } else if ("scheduled".equals(status)) {
                    predicates.add(cb.isTrue(root.get("active")));
                    predicates.add(cb.isNotNull(root.get("startAt")));
                    predicates.add(cb.greaterThan(root.<LocalDateTime>get("startAt"), now));
                } else if ("expired".equals(status)) {
                    predicates.add(cb.isTrue(root.get("active")));
                    predicates.add(cb.isNotNull(root.get("endAt")));
                    predicates.add(cb.lessThan(root.<LocalDateTime>get("endAt"), now));
                }
            }
            if (search != null) {
                String likePattern = "%" + search.toUpperCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.upper(cb.coalesce(root.get("code"), "")), likePattern),
                        cb.like(cb.upper(cb.coalesce(root.get("ruleSummary"), "")), likePattern)
                ));
            }
            return cb.and(predicates.toArray(Predicate[]::new));
        };
    }

    private Specification<Voucher> buildCurrentlyActiveSpec(LocalDateTime now) {
        return (root, query, cb) -> cb.and(
                cb.isTrue(root.get("active")),
                cb.or(root.get("startAt").isNull(), cb.lessThanOrEqualTo(root.<LocalDateTime>get("startAt"), now)),
                cb.or(root.get("endAt").isNull(), cb.greaterThanOrEqualTo(root.<LocalDateTime>get("endAt"), now))
        );
    }
}
