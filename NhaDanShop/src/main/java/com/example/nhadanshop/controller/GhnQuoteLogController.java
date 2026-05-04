package com.example.nhadanshop.controller;

import com.example.nhadanshop.entity.GhnQuoteLog;
import com.example.nhadanshop.repository.GhnQuoteLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/ghn-quote-logs")
@RequiredArgsConstructor
public class GhnQuoteLogController {

    private final GhnQuoteLogRepository ghnQuoteLogRepository;

    @GetMapping
    public Page<GhnQuoteLog> list(
            @PageableDefault(size = 50, sort = "createdAt", direction = Sort.Direction.DESC) Pageable pageable) {
        return ghnQuoteLogRepository.findAllByOrderByCreatedAtDesc(pageable);
    }
}
