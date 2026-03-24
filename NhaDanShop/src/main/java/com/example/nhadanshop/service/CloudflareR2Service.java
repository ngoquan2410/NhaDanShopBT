package com.example.nhadanshop.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.io.IOException;
import java.net.URI;
import java.util.UUID;

/**
 * Service upload ảnh sản phẩm lên Cloudflare R2.
 *
 * R2 tương thích S3 API → dùng AWS SDK v2 với custom endpoint.
 *
 * ── Setup (5 phút) ──────────────────────────────────────────────────────────
 * 1. Vào https://dash.cloudflare.com → R2 → Create bucket
 *    Đặt tên: nhadanshop-images
 *
 * 2. Trong bucket → Settings → Public Access → Allow Access
 *    Copy "Public Bucket URL": https://pub-xxxx.r2.dev
 *
 * 3. Vào R2 → Manage R2 API Tokens → Create API Token
 *    Permissions: Object Read & Write
 *    Copy: Account ID, Access Key ID, Secret Access Key
 *
 * 4. Thêm vào application.properties:
 *    r2.account-id=xxxxxxxxxxxx
 *    r2.access-key-id=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *    r2.secret-access-key=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 *    r2.bucket-name=nhadanshop-images
 *    r2.public-url=https://pub-xxxx.r2.dev
 *
 * 5. Restart BE → badge "☁️ Cloudflare R2 sẵn sàng" sẽ hiện trong form upload ảnh
 * ────────────────────────────────────────────────────────────────────────────
 *
 * URL ảnh trả về: https://pub-xxxx.r2.dev/products/abc123.jpg
 * Dùng thẳng trong <img src="..."> — load qua Cloudflare CDN toàn cầu.
 */
@Slf4j
@Service
public class CloudflareR2Service {

    @Value("${r2.account-id:}")
    private String accountId;

    @Value("${r2.access-key-id:}")
    private String accessKeyId;

    @Value("${r2.secret-access-key:}")
    private String secretAccessKey;

    @Value("${r2.bucket-name:nhadanshop-images}")
    private String bucketName;

    @Value("${r2.public-url:}")
    private String publicUrl;

    private S3Client s3Client;
    private boolean configured = false;

    @PostConstruct
    public void init() {
        if (accountId.isBlank() || accessKeyId.isBlank() ||
                secretAccessKey.isBlank() || publicUrl.isBlank()) {
            log.warn("⚠️  Cloudflare R2 chưa được cấu hình. Upload ảnh sẽ không hoạt động.");
            log.warn("    Cần set: r2.account-id, r2.access-key-id, r2.secret-access-key, r2.public-url");
            return;
        }

        try {
            // R2 endpoint: https://<account-id>.r2.cloudflarestorage.com
            String endpoint = "https://" + accountId + ".r2.cloudflarestorage.com";

            s3Client = S3Client.builder()
                    .endpointOverride(URI.create(endpoint))
                    .credentialsProvider(StaticCredentialsProvider.create(
                            AwsBasicCredentials.create(accessKeyId, secretAccessKey)))
                    // R2 dùng region "auto" nhưng SDK cần một giá trị hợp lệ
                    .region(Region.of("auto"))
                    .build();

            configured = true;
            log.info("✅ Cloudflare R2 khởi tạo thành công. Bucket: {}, Public URL: {}",
                    bucketName, publicUrl);
        } catch (Exception e) {
            log.error("❌ Lỗi khởi tạo Cloudflare R2: {}", e.getMessage());
        }
    }

    /**
     * Upload file ảnh lên R2.
     * @param file  file ảnh (JPG, PNG, WEBP...)
     * @return public URL của ảnh: https://pub-xxx.r2.dev/products/filename.jpg
     */
    public String uploadImage(MultipartFile file) throws IOException {
        if (!configured) {
            throw new IllegalStateException(
                    "Cloudflare R2 chưa được cấu hình. Vui lòng thiết lập r2.* trong application.properties.");
        }

        String contentType = file.getContentType();
        if (contentType == null || !contentType.startsWith("image/")) {
            throw new IllegalArgumentException("Chỉ chấp nhận file hình ảnh (jpg, png, webp...)");
        }
        if (file.getSize() > 10 * 1024 * 1024) {
            throw new IllegalArgumentException("Ảnh tối đa 10MB");
        }

        // Generate unique key trong folder "products/"
        String originalName = file.getOriginalFilename() != null
                ? file.getOriginalFilename().replaceAll("[^a-zA-Z0-9._-]", "_")
                : "image.jpg";
        String ext = originalName.contains(".")
                ? originalName.substring(originalName.lastIndexOf('.'))
                : ".jpg";
        String key = "products/" + UUID.randomUUID().toString().replace("-", "").substring(0, 12) + ext;

        // Upload lên R2
        PutObjectRequest req = PutObjectRequest.builder()
                .bucket(bucketName)
                .key(key)
                .contentType(contentType)
                .contentLength(file.getSize())
                .build();

        s3Client.putObject(req, RequestBody.fromInputStream(file.getInputStream(), file.getSize()));

        // Trả về public URL
        String url = publicUrl.replaceAll("/+$", "") + "/" + key;
        log.info("✅ Upload R2 thành công: {} → {}", key, url);
        return url;
    }

    /**
     * Xóa ảnh khỏi R2 khi thay ảnh mới.
     * @param imageUrl URL public của ảnh cần xóa
     */
    public void deleteImage(String imageUrl) {
        if (!configured || imageUrl == null || imageUrl.isBlank()) return;
        try {
            // Extract key từ URL: https://pub-xxx.r2.dev/products/abc.jpg → products/abc.jpg
            String base = publicUrl.replaceAll("/+$", "") + "/";
            if (!imageUrl.startsWith(base)) return;
            String key = imageUrl.substring(base.length());

            s3Client.deleteObject(DeleteObjectRequest.builder()
                    .bucket(bucketName)
                    .key(key)
                    .build());
            log.info("🗑️ Đã xóa ảnh R2: {}", key);
        } catch (Exception e) {
            log.warn("⚠️ Không thể xóa ảnh R2: {}", e.getMessage());
        }
    }

    public boolean isConfigured() { return configured; }

    public String getPublicUrl() { return publicUrl; }
}
