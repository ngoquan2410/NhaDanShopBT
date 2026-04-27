

## Mục tiêu
Thay `LocalShippingAdapter` (zone fallback 3 vùng) bằng tích hợp **GHN API** để báo phí ship chính xác theo phường/xã + cân nặng. Giữ zone fallback làm dự phòng khi GHN lỗi/timeout/chưa cấu hình. Không thay đổi UI, không đổi `ShippingService` interface.

## Phạm vi
- Edge function `ghn-quote`: giữ token GHN ở server, gọi GHN Fee API.
- 2 adapter mới: `GhnShippingAdapter` + `HybridShippingAdapter`.
- Bảng mapping `province/district/ward` (mã GSO) ↔ GHN IDs (cache `localStorage`).
- Yêu cầu user nhập 3 secrets: `GHN_TOKEN`, `GHN_SHOP_ID`, `GHN_FROM_DISTRICT_ID`.
- KHÔNG sửa: UI Checkout/Cart, `ShippingService` interface, `LocalShippingAdapter`, store settings shipping zones.

## Kiến trúc

```text
UI (Checkout) ──► @/services.shipping ──► HybridShippingAdapter
                                              ├── GhnShippingAdapter
                                              │     └── supabase.functions.invoke("ghn-quote")
                                              │            └── GHN Fee API (token server-side)
                                              └── LocalShippingAdapter (zone fallback)
```

Hybrid logic: nếu địa chỉ đủ (province+district+ward) → gọi GHN; nếu lỗi/timeout/thiếu config → rơi về local zone fallback và set `source: "zone_fallback"`.

## GHN endpoints sử dụng (server-side, qua edge function)

- `POST https://online-gateway.ghn.vn/shiip/public-api/master-data/province` — list tỉnh GHN
- `POST https://online-gateway.ghn.vn/shiip/public-api/master-data/district` — list quận theo `province_id`
- `POST https://online-gateway.ghn.vn/shiip/public-api/master-data/ward?district_id=...` — list phường
- `POST https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services` — lấy `service_id` khả dụng
- `POST https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee` — tính phí

Header: `Token: <GHN_TOKEN>`, `ShopId: <GHN_SHOP_ID>`, `Content-Type: application/json`.

## Bảng mapping mã GSO ↔ GHN ID

GHN dùng ID nội bộ riêng (≠ mã GSO của Province Open API). Edge function thực hiện mapping 1 lần trên mỗi request bằng cách:
1. Cache server-side trong memory module (process scope) cho province/district list (TTL 24h).
2. Match theo **tên chuẩn hoá** (lowercase, bỏ dấu, bỏ tiền tố "Tỉnh/Thành phố/Quận/Huyện/Phường/Xã").
3. Trả về object: `{ ghnDistrictId, ghnWardCode, fee, etaDays, serviceId }`.

Client gửi cho edge function: `{ provinceName, districtName, wardName, weightGrams, subtotal }` — đơn giản, không cần client biết GHN ID.

## Triển khai chi tiết

### 1. Edge function `supabase/functions/ghn-quote/index.ts`

**Input (POST JSON):**
```ts
{
  provinceName: string;
  districtName: string;
  wardName: string;
  weightGrams?: number;   // mặc định 500g
  subtotal: number;       // dùng tính insurance_value & freeship threshold local
}
```

**Output:**
```ts
// Success
{ ok: true, fee: number, etaDays: { min: number, max: number }, serviceId: number }

// Failure (HTTP 200 với ok:false, để client phân biệt config vs runtime)
{ ok: false, reason: "no_config" | "address_unmapped" | "no_service" | "ghn_error", message: string }
```

**Steps:**
1. CORS preflight + headers chuẩn.
2. Validate input bằng Zod (`provinceName`, `districtName`, `wardName` non-empty; `weightGrams` 1–30000; `subtotal ≥ 0`).
3. Đọc env: `GHN_TOKEN`, `GHN_SHOP_ID`, `GHN_FROM_DISTRICT_ID`. Thiếu → return `{ok:false, reason:"no_config"}`.
4. Lấy danh sách province GHN (cache module-level 24h) → match `provinceName` → `province_id`.
5. Lấy district theo `province_id` (cache theo province) → match `districtName` → `district_id`.
6. Lấy ward theo `district_id` (cache theo district) → match `wardName` → `ward_code`.
7. Nếu bất kỳ bước map nào fail → `{ok:false, reason:"address_unmapped"}`.
8. Gọi `available-services` với `from_district`, `to_district` → chọn service rẻ nhất (hoặc `service_type_id: 2` standard).
9. Gọi `fee` với payload chuẩn (weight 500g default, length 20, width 15, height 10).
10. Trả `{ok:true, fee, etaDays, serviceId}`. ETA hardcode `{min:2, max:4}` (GHN không trả ETA trực tiếp ở fee API; dùng `leadtime` API riêng nếu cần — Phase B.1).
11. Try/catch toàn bộ; mọi lỗi GHN → `{ok:false, reason:"ghn_error", message}`. Log lỗi qua `console.error`.

Không cần config block trong `supabase/config.toml` (mặc định verify_jwt=false đã ổn cho endpoint public).

**Chuẩn hoá tên:**
```ts
function norm(s: string): string {
  return s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/^(tinh|thanh pho|tp\.?|quan|huyen|thi xa|phuong|xa|thi tran)\s+/i, "")
    .replace(/\s+/g, " ").trim();
}
```

### 2. `src/services/adapters/remote/GhnShippingAdapter.ts`

Implement `ShippingService` (interface hiện tại trong `src/services/shipping/ShippingService.ts`). Method `quote(input: ShippingQuoteInput): Promise<ShippingQuote>`.

Logic:
1. Nếu `address.provinceName / districtName / wardName` thiếu → throw `"address_incomplete"` (để Hybrid fallback).
2. Cache `localStorage` key `ship:ghn:{provinceName}|{districtName}|{wardName}|{weight}` TTL 30 phút (giảm gọi).
3. `supabase.functions.invoke("ghn-quote", { body })` với timeout 8s (AbortController).
4. Nếu response `{ok:false}` → throw `Error(reason)`.
5. Áp dụng freeship threshold local: nếu `subtotal >= FREESHIP_THRESHOLD` (đọc từ `storeSettings` shipping config — giữ nguyên rule local) → set `fee: 0, freeShipApplied: true`.
6. Map sang `ShippingQuote`:
   ```ts
   { status: "quoted", source: "carrier_api", fee, etaDays, freeShipApplied }
   ```

### 3. `src/services/adapters/remote/HybridShippingAdapter.ts`

```text
quote(input):
  if (!ghnConfigured signal known via prior failure flag) → goto local
  try await ghn.quote(input)
  catch err:
    warnOnce(err)
    return await local.quote(input)
```

Có `disabledUntil: number` để tạm tắt GHN 60s sau khi gặp `no_config` hoặc 5xx liên tiếp 3 lần (circuit breaker đơn giản) — tránh spam edge function khi user chưa cấu hình.

### 4. `src/services/index.ts`

Đổi:
```ts
export const shipping: ShippingService = new HybridShippingAdapter(
  new GhnShippingAdapter(storeSettings),
  new LocalShippingAdapter(),
);
```

### 5. Secrets cần user cung cấp

Sau khi tạo file edge function, gọi `add_secret` với 3 keys:
- `GHN_TOKEN` — Token API GHN, lấy tại `https://khachhang.ghn.vn` → Cài đặt → Token API
- `GHN_SHOP_ID` — ShopID dạng số, ở góc trên trang quản trị GHN
- `GHN_FROM_DISTRICT_ID` — DistrictID kho lấy hàng (số). User có thể tra ở GHN dashboard hoặc tôi cung cấp script test sau khi deploy.

### 6. Files thay đổi

- ➕ `supabase/functions/ghn-quote/index.ts` (mới, ~180 dòng)
- ➕ `src/services/adapters/remote/GhnShippingAdapter.ts` (mới)
- ➕ `src/services/adapters/remote/HybridShippingAdapter.ts` (mới)
- ✏️ `src/services/index.ts` (đổi binding `shipping`)
- ✏️ `src/services/README.md` (thêm 2 dòng mô tả)

## Rủi ro & xử lý

| Rủi ro | Giải pháp |
|---|---|
| Tên phường/quận lệch giữa Province Open API và GHN | Hàm `norm()` bỏ dấu + tiền tố; nếu match fail → fallback local, không block đặt hàng |
| GHN 5xx / quá tải | Circuit breaker 60s + fallback zone |
| Token chưa cấu hình | `reason:"no_config"` → fallback ngay, không hiển thị lỗi cho khách |
| Latency 200–600ms mỗi quote | Cache 30 phút client-side; debounce ở UI đã có sẵn |
| User dùng địa chỉ cũ chưa có ward (đơn cũ) | Thiếu `wardName` → throw `address_incomplete` → fallback local |

## Kiểm thử sau triển khai

1. Khi chưa add secrets → đặt hàng vẫn ra phí (zone fallback), console log warn 1 lần.
2. Sau khi add 3 secrets → vào Checkout chọn địa chỉ HCM/HN/tỉnh xa → phí GHN khác zone, badge "GHN" trong order timeline (nếu có).
3. Nhập địa chỉ phường lạ → fallback zone hoạt động.
4. Tắt mạng → fallback zone hoạt động.
5. `subtotal` vượt freeship threshold → `fee = 0`.

