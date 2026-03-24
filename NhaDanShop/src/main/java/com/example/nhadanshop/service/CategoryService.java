package com.example.nhadanshop.service;

import com.example.nhadanshop.dto.CategoryRequest;
import com.example.nhadanshop.dto.CategoryResponse;
import com.example.nhadanshop.entity.Category;
import com.example.nhadanshop.repository.CategoryRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CategoryService {

    private final CategoryRepository categoryRepository;

    public List<CategoryResponse> findAll() {
        return categoryRepository.findByActiveTrueOrderByNameAsc()
                .stream().map(DtoMapper::toResponse).toList();
    }

    public CategoryResponse findById(Long id) {
        return DtoMapper.toResponse(findEntityById(id));
    }

    @Transactional
    public CategoryResponse create(CategoryRequest req) {
        if (categoryRepository.existsByName(req.name())) {
            throw new IllegalStateException("Tên category '" + req.name() + "' đã tồn tại");
        }
        Category c = new Category();
        c.setName(req.name());
        c.setDescription(req.description());
        c.setActive(req.active() == null ? true : req.active());
        c.setCreatedAt(LocalDateTime.now());
        c.setUpdatedAt(LocalDateTime.now());
        return DtoMapper.toResponse(categoryRepository.save(c));
    }

    @Transactional
    public CategoryResponse update(Long id, CategoryRequest req) {
        Category c = findEntityById(id);
        if (categoryRepository.existsByNameAndIdNot(req.name(), id)) {
            throw new IllegalStateException("Tên category '" + req.name() + "' đã được dùng bởi category khác");
        }
        c.setName(req.name());
        c.setDescription(req.description());
        c.setActive(req.active() == null ? c.getActive() : req.active());
        c.setUpdatedAt(LocalDateTime.now());
        return DtoMapper.toResponse(categoryRepository.save(c));
    }

    @Transactional
    public void softDelete(Long id) {
        Category c = findEntityById(id);
        c.setActive(false);
        c.setUpdatedAt(LocalDateTime.now());
        categoryRepository.save(c);
    }

    private Category findEntityById(Long id) {
        return categoryRepository.findById(id)
                .orElseThrow(() -> new EntityNotFoundException("Không tìm thấy category ID: " + id));
    }
}