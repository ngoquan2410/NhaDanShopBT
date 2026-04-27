package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.CategoryPatchRequest;
import com.example.nhadanshop.dto.CategoryRequest;
import com.example.nhadanshop.dto.CategoryResponse;
import com.example.nhadanshop.service.CategoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryService categoryService;

    @GetMapping
    public List<CategoryResponse> all(
            @RequestParam(value = "includeInactive", required = false, defaultValue = "false") boolean includeInactive) {
        return categoryService.findAll(includeInactive);
    }

    @GetMapping("/{id}")
    public CategoryResponse one(@PathVariable Long id) {
        return categoryService.findById(id);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public CategoryResponse create(@Valid @RequestBody CategoryRequest req) {
        return categoryService.create(req);
    }

    @PutMapping("/{id}")
    public CategoryResponse update(@PathVariable Long id, @Valid @RequestBody CategoryRequest req) {
        return categoryService.update(id, req);
    }

    @PatchMapping("/{id}")
    public CategoryResponse patch(@PathVariable Long id, @Valid @RequestBody CategoryPatchRequest req) {
        return categoryService.patch(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        categoryService.deleteOrArchive(id);
    }
}