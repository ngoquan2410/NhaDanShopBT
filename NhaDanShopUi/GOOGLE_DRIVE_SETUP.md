# Hướng dẫn Upload Ảnh Sản Phẩm — NhaDanShop

## ❌ Vấn đề với Google Drive Service Account

Google Drive API **không cho phép Service Account upload** vào My Drive vì:
```
"Service Accounts do not have storage quota"
```
Service Account cần Shared Drive (Google Workspace — trả phí) để có quota.

---

## ✅ Giải pháp hiện tại — 2 cách upload ảnh

### Cách 1: Kéo thả / Chọn file → Lưu Base64 trong DB
- Admin kéo thả hoặc click chọn ảnh trong form sản phẩm
- Ảnh được convert sang **base64** và lưu trực tiếp vào cột `image_url` trong DB
- ✅ Không cần server ngoài, hoạt động offline
- ⚠️ Ảnh lớn (>200KB) sẽ tăng kích thước DB — nên resize ảnh trước khi upload
- 💡 Khuyến nghị: ảnh sản phẩm < 200KB, resize về 400×400px

### Cách 2: Nhập URL từ host ảnh miễn phí

Upload ảnh lên host ngoài rồi copy URL vào ô "Nhập URL ảnh":

#### Option A — Imgur (Khuyến nghị, dễ nhất)
1. Vào https://imgur.com/upload (không cần đăng nhập)
2. Kéo thả ảnh vào trang
3. Click chuột phải ảnh → **Copy image address**
4. Paste URL vào ô nhập URL trong form sản phẩm
5. Ví dụ URL: `https://i.imgur.com/abc123.jpg`

#### Option B — Google Drive (Public link)
1. Upload ảnh lên Google Drive cá nhân của bạn
2. Click chuột phải → **Share** → **Anyone with the link**
3. Lấy File ID từ URL: `https://drive.google.com/file/d/`**`FILE_ID`**`/view`
4. Dùng URL trực tiếp: `https://drive.google.com/uc?export=view&id=FILE_ID`
5. Paste vào ô URL trong form

#### Option C — Cloudinary (Free 25GB)
1. Đăng ký tại https://cloudinary.com (miễn phí)
2. Upload ảnh → lấy URL dạng: `https://res.cloudinary.com/...`
3. Paste vào ô URL trong form

---

## So sánh các phương án

| | Base64 (FE) | Imgur URL | Google Drive URL | Cloudinary |
|--|--|--|--|--|
| Setup | ✅ 0 phút | ✅ 0 phút | ✅ 5 phút | ⚠️ 10 phút |
| Storage | DB (giới hạn) | ✅ Free | ✅ Drive cá nhân | ✅ 25GB free |
| Load tốc độ | ✅ Nhanh (local) | ✅ CDN nhanh | ⚠️ Trung bình | ✅ CDN nhanh |
| Offline | ✅ Hoạt động | ❌ Cần internet | ❌ Cần internet | ❌ Cần internet |
| Khuyến nghị | Shop nhỏ | ✅ Dùng ngay | OK | Production |

---

## Khuyến nghị cho NhaDanShop

**Hiện tại:** Dùng **Base64** (kéo thả file) + **Imgur URL** (cho ảnh chất lượng cao)

**Tương lai:** Nếu muốn upgrade:
- Dùng **Cloudinary** với unsigned upload preset
- Hoặc setup **AWS S3** / **MinIO** self-hosted

---

# Hướng dẫn Upload Ảnh — Cloudflare R2

## Tại sao Cloudflare R2?

| | Google Drive SA | Imgur | **Cloudflare R2** |
|--|--|--|--|
| Storage | ❌ Không có quota | Giới hạn | ✅ **10GB free** |
| CDN | ❌ | ✅ | ✅ **Cloudflare Global CDN** |
| Egress fee | - | - | ✅ **$0 (không tính phí)** |
| S3 Compatible | ❌ | ❌ | ✅ **AWS SDK** |
| Custom domain | ❌ | ❌ | ✅ |
| Setup | Phức tạp | 0 phút | **5 phút** |

---

## Setup Cloudflare R2 (5 phút)

### Bước 1 — Tạo R2 Bucket

1. Vào https://dash.cloudflare.com → **R2 Object Storage**
2. Click **Create bucket**
3. Đặt tên: `nhadanshop-images` → **Create bucket**
4. Trong bucket → tab **Settings** → **Public Access** → **Allow Access**
5. Copy **Public Bucket URL**: `https://pub-xxxxxx.r2.dev`

### Bước 2 — Tạo API Token

1. R2 → **Manage R2 API Tokens** → **Create API Token**
2. Token name: `nhadanshop-upload`
3. Permissions: **Object Read & Write**
4. Specify bucket: `nhadanshop-images`
5. Click **Create API Token**
6. Copy 3 giá trị:
   - **Account ID** (trang chủ Cloudflare, bên phải)
   - **Access Key ID**
   - **Secret Access Key** ← chỉ hiện 1 lần!

### Bước 3 — Cấu hình BE

Thêm vào `application.properties`:

```properties
r2.account-id=your_account_id_here
r2.access-key-id=your_access_key_id_here
r2.secret-access-key=your_secret_access_key_here
r2.bucket-name=nhadanshop-images
r2.public-url=https://pub-xxxxxx.r2.dev
```

### Bước 4 — Restart BE và kiểm tra

```
GET http://localhost:8080/api/images/status
```

Kết quả mong đợi:
```json
{
  "configured": true,
  "provider": "Cloudflare R2",
  "message": "☁️ Cloudflare R2 đã sẵn sàng"
}
```

---

## Cách hoạt động

```
Admin kéo thả ảnh
  → FE gửi POST /api/images/upload (multipart)
  → BE upload lên R2 bucket (S3 API)
  → R2 trả về key "products/abc123.jpg"
  → BE tạo public URL: https://pub-xxx.r2.dev/products/abc123.jpg
  → FE lưu URL → DB → Store hiển thị ảnh qua Cloudflare CDN
```

---

## Fallback khi R2 chưa cấu hình

Nếu `r2.*` chưa set, hệ thống tự động **fallback sang Base64**:
- Admin chọn file → FE convert sang base64 → lưu thẳng vào DB
- Hoạt động hoàn toàn offline
- Nhược điểm: ảnh lớn làm tăng kích thước DB

**Khuyến nghị:** Resize ảnh < 200KB trước khi dùng base64 (dùng https://squoosh.app)

---

## Cấu trúc folder R2

```
nhadanshop-images/          ← bucket
  products/                 ← folder
    abc123def.jpg           ← ảnh sản phẩm
    xyz789ghi.png
```
