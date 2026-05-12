package com.example.nhadanshop.controller;

import com.example.nhadanshop.entity.GhnQuoteLog;
import com.example.nhadanshop.repository.GhnQuoteLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/ghn-quote-logs")
@RequiredArgsConstructor
public class GhnQuoteLogController {

    private final GhnQuoteLogRepository ghnQuoteLogRepository;

    @GetMapping
    public Page<GhnQuoteLog> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) Boolean ok,
            @RequestParam(required = false) String reason,
            @PageableDefault(size = 50, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        String q = (search != null && !search.isBlank()) ? search.trim() : null;
        String reasonParam = (reason != null && !reason.isBlank()) ? reason.trim() : null;
        boolean hasFilter = q != null || ok != null || (reasonParam != null && !reasonParam.isEmpty());
        if (!hasFilter) {
            return ghnQuoteLogRepository.findAllByOrderByCreatedAtDesc(pageable);
        }
        return ghnQuoteLogRepository.searchPage(ok, reasonParam, q, pageable);
    }
}
