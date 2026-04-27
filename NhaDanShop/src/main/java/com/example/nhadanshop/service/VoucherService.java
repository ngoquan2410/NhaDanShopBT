package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.VoucherRequest;
import com.example.nhadanshop.dto.VoucherResponse;
import com.example.nhadanshop.entity.Voucher;
import com.example.nhadanshop.repository.VoucherRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional
public class VoucherService {

    private final VoucherRepository voucherRepository;

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

    public Page<VoucherResponse> list(Pageable pageable) {
        return voucherRepository.findAllByOrderByCreatedAtDesc(pageable).map(this::toResponse);
    }

    public List<VoucherResponse> listActive() {
        return voucherRepository.findByActiveTrueOrderByCodeAsc().stream()
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
        if (voucherRepository.isVoucherCodeUsedInAnySnapshot(v.getCode())) {
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
    }

    private VoucherResponse toResponse(Voucher v) {
        return new VoucherResponse(
                v.getId(),
                v.getCode(),
                v.getRuleSummary(),
                Boolean.TRUE.equals(v.getActive()),
                v.getCreatedAt(),
                v.getUpdatedAt()
        );
    }
}
