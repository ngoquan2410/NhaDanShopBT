package com.example.nhadanshop.controller;

import com.example.nhadanshop.dto.PromotionRequest;
import com.example.nhadanshop.dto.PromotionResponse;
import com.example.nhadanshop.dto.PromotionEvaluationRequest;
import com.example.nhadanshop.dto.PromotionEvaluationResponse;
import com.example.nhadanshop.service.PromotionEvaluationService;
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
    private final PromotionEvaluationService promotionEvaluationService;

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

    /** POST /api/promotions/evaluate — Stateless cart promotion preview */
    @PostMapping("/evaluate")
    public List<PromotionEvaluationResponse> evaluate(@Valid @RequestBody PromotionEvaluationRequest req) {
        return promotionEvaluationService.evaluate(req);
    }

    /** POST /api/promotions/pick-best — Stateless best promotion preview */
    @PostMapping("/pick-best")
    public PromotionEvaluationResponse pickBest(@Valid @RequestBody PromotionEvaluationRequest req) {
        return promotionEvaluationService.pickBest(req);
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
