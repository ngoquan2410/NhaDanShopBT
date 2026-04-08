package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.SupplierRequest;
import com.example.nhadanshop.dto.SupplierResponse;
import com.example.nhadanshop.entity.Supplier;
import com.example.nhadanshop.repository.SupplierRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class SupplierService {

    private final SupplierRepository supplierRepository;

    @Transactional(readOnly = true)
    public List<SupplierResponse> getAll() {
        return supplierRepository.findByActiveTrueOrderByNameAsc()
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<SupplierResponse> search(String q) {
        if (q == null || q.isBlank()) return getAll();
        return supplierRepository.searchActive(q.trim())
                .stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public SupplierResponse getById(Long id) {
        return toResponse(findOrThrow(id));
    }

    @Transactional
    public SupplierResponse create(SupplierRequest req) {
        String code = req.code().trim().toUpperCase();
        if (supplierRepository.existsByCode(code))
            throw new IllegalStateException("Mã NCC '" + code + "' đã tồn tại.");

        Supplier s = new Supplier();
        s.setCode(code);
        s.setName(req.name().trim());
        s.setPhone(req.phone());
        s.setAddress(req.address());
        s.setTaxCode(req.taxCode());
        s.setEmail(req.email());
        s.setNote(req.note());
        s.setActive(req.active() != null ? req.active() : true);
        return toResponse(supplierRepository.save(s));
    }

    @Transactional
    public SupplierResponse update(Long id, SupplierRequest req) {
        Supplier s = findOrThrow(id);
        String code = req.code().trim().toUpperCase();
        if (!code.equals(s.getCode()) && supplierRepository.existsByCodeAndIdNot(code, id))
            throw new IllegalStateException("Mã NCC '" + code + "' đã tồn tại.");

        s.setCode(code);
        s.setName(req.name().trim());
        s.setPhone(req.phone());
        s.setAddress(req.address());
        s.setTaxCode(req.taxCode());
        s.setEmail(req.email());
        s.setNote(req.note());
        if (req.active() != null) s.setActive(req.active());
        return toResponse(supplierRepository.save(s));
    }

    @Transactional
    public void deactivate(Long id) {
        Supplier s = findOrThrow(id);
        s.setActive(false);
        supplierRepository.save(s);
    }

    private Supplier findOrThrow(Long id) {
        return supplierRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy NCC ID: " + id));
    }

    private SupplierResponse toResponse(Supplier s) {
        return new SupplierResponse(
                s.getId(), s.getCode(), s.getName(),
                s.getPhone(), s.getAddress(), s.getTaxCode(),
                s.getEmail(), s.getNote(), s.getActive(),
                s.getCreatedAt(), s.getUpdatedAt()
        );
    }
}
