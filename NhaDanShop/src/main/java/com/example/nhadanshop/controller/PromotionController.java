package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.PromotionRequest;
import com.example.nhadanshop.dto.PromotionResponse;
import com.example.nhadanshop.service.PromotionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/promotions")
@RequiredArgsConstructor
public class PromotionController {

    private final PromotionService promotionService;

    /** GET /api/promotions?page=&size= — Danh sách tất cả khuyến mãi (có phân trang) */
    @GetMapping
    public Page<PromotionResponse> list(@PageableDefault(size = 20) Pageable pageable) {
        return promotionService.list(pageable);
    }

    /** GET /api/promotions/active — Các khuyến mãi đang còn hiệu lực */
    @GetMapping("/active")
    public List<PromotionResponse> listActive() {
        return promotionService.listActive();
    }

    /** GET /api/promotions/{id} */
    @GetMapping("/{id}")
    public PromotionResponse one(@PathVariable Long id) {
        return promotionService.getOne(id);
    }

    /** POST /api/promotions — Tạo mới */
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public PromotionResponse create(@Valid @RequestBody PromotionRequest req) {
        return promotionService.create(req);
    }

    /** PUT /api/promotions/{id} — Cập nhật */
    @PutMapping("/{id}")
    public PromotionResponse update(@PathVariable Long id,
                                    @Valid @RequestBody PromotionRequest req) {
        return promotionService.update(id, req);
    }

    /** PATCH /api/promotions/{id}/toggle — Bật/Tắt */
    @PatchMapping("/{id}/toggle")
    public PromotionResponse toggle(@PathVariable Long id) {
        return promotionService.toggleActive(id);
    }

    /** DELETE /api/promotions/{id} */
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        promotionService.delete(id);
    }
}
