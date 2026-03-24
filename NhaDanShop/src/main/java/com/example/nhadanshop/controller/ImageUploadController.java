package com.example.nhadanshop.controller;

import com.example.nhadanshop.service.CloudflareR2Service;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.util.Map;

/**
 * API upload ảnh sản phẩm lên Cloudflare R2.
 *
 * POST  /api/images/upload     — upload file ảnh, trả về { url, message }
 * DELETE /api/images?url=...   — xóa ảnh khỏi R2
 * GET   /api/images/status     — kiểm tra R2 đã cấu hình chưa (public)
 */
@RestController
@RequestMapping("/api/images")
@RequiredArgsConstructor
public class ImageUploadController {

    private final CloudflareR2Service r2Service;

    /**
     * Upload ảnh lên Cloudflare R2.
     * POST /api/images/upload
     */
    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file) {
        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File không được rỗng");
        }

        if (!r2Service.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Cloudflare R2 chưa được cấu hình. Vui lòng nhập URL ảnh thủ công.");
        }

        try {
            String url = r2Service.uploadImage(file);
            return Map.of(
                    "url", url,
                    "message", "Upload thành công lên Cloudflare R2",
                    "filename", file.getOriginalFilename() != null ? file.getOriginalFilename() : "image"
            );
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, e.getMessage());
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "Lỗi upload lên Cloudflare R2: " + e.getMessage());
        }
    }

    /**
     * Xóa ảnh khỏi Cloudflare R2.
     * DELETE /api/images?url=https://drive.google.com/uc?export=view&id=FILE_ID
     */
    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@RequestParam String url) {
        r2Service.deleteImage(url);
    }

    /**
     * Kiểm tra trạng thái Cloudflare R2.
     * GET /api/images/status
     */
    @GetMapping("/status")
    public Map<String, Object> status() {
        boolean ok = r2Service.isConfigured();
        return Map.of(
                "configured", ok,
                "provider", "Cloudflare R2",
                "message", ok ? "☁️ Cloudflare R2 đã sẵn sàng"
                        : "Cloudflare R2 chưa được cấu hình — dùng URL thủ công"
        );
    }
}
