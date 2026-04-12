# Phân tích: Flexible piecesPerUnit — Nhập 1kg về chia bịch nhỏ tùy thời điểm

> **Clarification use case thực tế (quan trọng hơn scenario cũ):**
>
> Admin nhập **1 bịch 1kg** từ NCC.  
> Về cửa hàng, **tự chia** thành bịch nhỏ để bán — **tùy thời điểm**:
> - Hôm nay: 1kg → 5 bịch 200g → `piecesPerUnit = 5`
> - Tuần sau: 1kg → 2 bịch 500g → `piecesPerUnit = 2`
>
> **Đây KHÔNG phải lỗi admin** — đây là business requirement hợp lệ:  
> cùng 1 sản phẩm nhưng **mỗi lần nhập hàng có thể chia khác nhau**.

---

## I. Chẩn đoán: Hệ thống đã hỗ trợ được 90%

```
Kiến trúc snapshot bất biến đã đúng:

InventoryReceiptItem
  ├── pieces_used         ← SNAPSHOT per-receipt ← ĐÃ CÓ ✅
  ├── import_unit_used    ← SNAPSHOT per-receipt ← ĐÃ CÓ ✅
  └── retail_qty_added    ← SNAPSHOT = qty × pieces_used ← ĐÃ CÓ ✅

ProductBatch
  └── cost_price          ← = finalCostWithVat/bịch tại lần nhập đó ← ĐÃ CÓ ✅

ReceiptItemRequest
  └── piecesOverride      ← Field cho admin override per-receipt ← ĐÃ CÓ ✅

InventoryReceiptService   ← Đã ưu tiên piecesOverride khi != null ← ĐÃ ĐÚNG ✅
```

**10% còn thiếu:**
1. **UI** không expose `piecesOverride` rõ ràng → admin không biết có thể override
2. **unit_cost_snapshot** khi bán lấy từ `variant.costPrice` (giá gần nhất) thay vì từ FEFO batch → **sai giá vốn** khi pieces thay đổi giữa các lần nhập
3. **Không có `sell_unit_snapshot`** trong receipt_item → audit sau này khó

---

## II. Timeline minh họa với use case thực tế

### Lần nhập 1: 1kg → 5 bịch 200g
```
Request: productId=BT001, quantity=3 kg, unitCost=60,000₫/kg
         piecesOverride=5 (admin điền: "lần này chia 5 bịch/kg")
         importUnit="kg"

Service xử lý:
  pieces_used = 5 (từ piecesOverride)
  retail_qty_added = 3 × 5 = 15 bịch
  costPerBich = 60,000 / 5 = 12,000₫/bịch

Kết quả:
  → receipt_item.pieces_used = 5       ← SNAPSHOT ✅
  → receipt_item.retail_qty_added = 15 ← SNAPSHOT ✅
  → batch_1.costPrice = 12,000₫/bịch  ← SNAPSHOT ✅
  → variant.stockQty += 15 = 15 bịch
  → variant.costPrice = 12,000₫/bịch
```

### Bán 10 bịch (sau lần nhập 1)
```
SalesInvoiceItem:
  quantity = 10
  unit_cost_snapshot = variant.costPrice = 12,000₫  ✅ (lúc này đúng)

batch_1.remainingQty: 15 → 5 bịch
variant.stockQty: 15 → 5 bịch
```

### Lần nhập 2: 1kg → 2 bịch 500g (NCC đổi quy cách hoặc admin quyết định)
```
Request: productId=BT001, quantity=2 kg, unitCost=60,000₫/kg
         piecesOverride=2 (admin điền: "lần này chia 2 bịch/kg")

Service xử lý:
  pieces_used = 2
  retail_qty_added = 2 × 2 = 4 bịch
  costPerBich = 60,000 / 2 = 30,000₫/bịch ← bịch lớn hơn, đắt hơn — ĐÚNG!

Kết quả:
  → batch_2.costPrice = 30,000₫/bịch  ← SNAPSHOT ✅
  → variant.stockQty = 5 + 4 = 9 bịch
  → variant.costPrice = 30,000₫/bịch  ← OVERWRITE! (chỉ lưu giá gần nhất)
```

### ⚠️ Bán 3 bịch 200g CÒN TỒN từ lần nhập 1 (sau lần nhập 2)
```
unit_cost_snapshot = variant.costPrice = 30,000₫  ← SAI! ❌
                                          (thực ra là 12,000₫/bịch từ batch_1)

→ Giá vốn ghi sổ: 3 × 30,000 = 90,000₫
→ Giá vốn thực tế: 3 × 12,000 = 36,000₫
→ Sai lệch báo cáo lãi/lỗ: 54,000₫ ❌
```

---

## III. Danh sách vấn đề & mức độ

| # | Vấn đề | Mức độ | Ảnh hưởng |
|---|--------|--------|-----------|
| 1 | UI không có field `piecesOverride` rõ ràng | 🔴 CRITICAL | Admin không thể override per-receipt → luôn dùng default |
| 2 | `unit_cost_snapshot` lấy từ `variant.costPrice` thay vì FEFO batch | 🔴 CRITICAL | Báo cáo lãi/lỗ sai khi có nhiều batch với giá vốn khác nhau |
| 3 | Thiếu `sell_unit_snapshot` trong receipt_item | 🟡 MEDIUM | Audit lịch sử không biết lần đó bán đơn vị gì |
| 4 | `product_import_units.pieces_per_unit` bị overwrite khi admin đổi | 🟡 MEDIUM | Mất gợi ý mặc định cũ, không có audit trail |
| 5 | Template Excel phiếu nhập thiếu cột `piecesOverride` | 🟡 MEDIUM | Import hàng loạt không override được pieces |
| 6 | Warning khi sửa `piecesPerUnit` ở variant | 🟢 LOW | UX — tránh nhầm lẫn |

---

## IV. Vấn đề 1 (CRITICAL): `unit_cost_snapshot` sai — Root cause & fix

### Root cause
```java
// InvoiceService — hiện tại (SAI với multi-batch)
SalesInvoiceItem item = new SalesInvoiceItem();
item.setUnitCostSnapshot(variant.getCostPrice()); // ← luôn = giá lần nhập CUỐI
```

### Fix đúng: Lấy costPrice từ FEFO batch bị deduct
```java
// InvoiceService — fix (ĐÚNG)
// Khi FEFO deduct batch, lưu lại weighted avg cost của các batch đã lấy
BigDecimal fefoAvgCost = calculateFefoWeightedCost(variant, quantity);
item.setUnitCostSnapshot(fefoAvgCost);

// Hoặc đơn giản hơn: dùng weighted average của TẤT CẢ batch còn tồn
// = (SUM(batch.remainingQty × batch.costPrice)) / SUM(batch.remainingQty)
```

---

## V. Đề xuất giải pháp — Thứ tự ưu tiên

### 🔴 Priority 1: Expose `piecesOverride` trong UI phiếu nhập

**FE — Form tạo phiếu nhập (ReceiptsPage.jsx):**
```
Mỗi dòng sản phẩm trong form:
  [Sản phẩm]  [ĐV nhập: kg]  [Số lượng: 3]  [Giá/kg: 60,000]
  [Số bịch/kg lần này: ___]  ← THÊM FIELD NÀY (pre-fill từ product_import_units)
  → Hiển thị live: "3 kg × 5 = 15 bịch | Giá vốn/bịch = 12,000₫"
```

**BE — Không cần thay đổi** vì `piecesOverride` và ưu tiên nó đã có.

---

### 🔴 Priority 2: Fix `unit_cost_snapshot` = FEFO weighted avg

**Thay đổi InvoiceService:**
```java
// Tính weighted avg cost từ batch sẽ bị deduct (FEFO order)
BigDecimal avgCost = computeFefoAvgCost(variant.getId(), quantity);
item.setUnitCostSnapshot(avgCost);
```

**Logic `computeFefoAvgCost`:**
```java
// Lấy các batch theo FEFO order (expiry ASC, created ASC)
// Tính tổng qty cần lấy, nhân với cost từng batch → weighted avg
List<ProductBatch> batches = batchRepo.findByVariantOrderByFefo(variantId);
BigDecimal totalCost = ZERO; int remaining = quantity;
for (ProductBatch b : batches) {
    int take = Math.min(remaining, b.getRemainingQty());
    totalCost = totalCost.add(b.getCostPrice().multiply(BigDecimal.valueOf(take)));
    remaining -= take;
    if (remaining <= 0) break;
}
return totalCost.divide(BigDecimal.valueOf(quantity), 2, HALF_UP);
```

---

### 🟡 Priority 3: Thêm `sell_unit_snapshot` vào `inventory_receipt_items`

**Flyway V31:**
```sql
ALTER TABLE inventory_receipt_items
    ADD COLUMN sell_unit_snapshot VARCHAR(20) NULL
    COMMENT 'Snapshot đơn vị bán lẻ tại thời điểm nhập — audit trail';

-- Backfill từ variant hiện tại
UPDATE inventory_receipt_items iri
JOIN product_variants pv ON pv.id = iri.variant_id
SET iri.sell_unit_snapshot = pv.sell_unit
WHERE iri.sell_unit_snapshot IS NULL;
```

---

### 🟡 Priority 4: Thêm cột `piecesOverride` vào Excel template phiếu nhập

**ExcelTemplateService.buildReceiptTemplate():**
```
Thêm cột "Số đơn vị bán/1 ĐV nhập (override)"
Ghi chú: "Để trống = dùng gợi ý mặc định của SP. Điền số = override cho lần nhập này."
```

---

### 🟢 Priority 5: Warning modal khi sửa `piecesPerUnit` ở variant

**FE — VariantManager.jsx:**
```jsx
// Khi detectChange: form.piecesPerUnit !== originalVariant.piecesPerUnit
// Hiển thị warning trước khi save:
⚠️ Bạn đang thay đổi tỷ lệ quy đổi GỢI Ý MẶC ĐỊNH
Từ: 1 kg = 10 bịch → Mới: 1 kg = 5 bịch

Lưu ý:
• Lịch sử phiếu nhập: KHÔNG thay đổi (đã snapshot)
• Tồn kho hiện tại: KHÔNG thay đổi
• Phiếu nhập tiếp theo: tự điền 5 bịch/kg (giá vốn/gói thay đổi)

💡 Đây CHỈ là gợi ý mặc định — mỗi lần nhập có thể điền khác.
```

---

## VI. Tổng kết kiến trúc đúng

```
ProductVariant.piecesPerUnit
ProductImportUnit.piecesPerUnit
         ↓
         GỢI Ý MẶC ĐỊNH (pre-fill form)
         Có thể thay đổi bất kỳ lúc nào
         Không ảnh hưởng lịch sử (snapshot đã bảo vệ)

ReceiptItemRequest.piecesOverride
         ↓
         OVERRIDE PER-RECEIPT (admin điền mỗi lần nhập)
         Đây là giá trị THỰC TẾ dùng cho lần nhập đó

inventory_receipt_items.pieces_used  ←────────────────────
         ↓                                                 |
         SNAPSHOT BẤT BIẾN                                 |
         Luôn phản ánh đúng thực tế lần nhập đó            |
         (piecesOverride > ProductImportUnit > variant)    |

product_batches.cost_price  ←──────────────────────────────
         ↓
         SNAPSHOT BẤT BIẾN = costPerRetail cho lần nhập đó
         Dùng làm nguồn cho unit_cost_snapshot khi bán (FEFO)

sales_invoice_items.unit_cost_snapshot
         = FEFO weighted avg cost từ batches bị deduct ← FIX CẦN THIẾT
```

---

## VII. Những gì KHÔNG cần làm

| ❌ Không làm | Lý do |
|-------------|-------|
| Thêm bảng `conversion_rate_history` | Snapshot trong `pieces_used` đã đủ cho audit |
| Lock `piecesPerUnit` sau nhập đầu | Ngược với use case — admin cần flexible |
| `stockQty` tính theo gram | Over-engineering, phá vỡ toàn bộ query |
| Tạo variant mới mỗi khi đổi pieces | Không cần, đây là cùng 1 sản phẩm vật lý |
| Tính lại lịch sử khi đổi default | Vi phạm immutability, sai về kế toán |

---

## VIII. Trường hợp đặc biệt: Khách mua bịch loại 1kg = 2 bịch

> **Tình huống:** Tồn kho đang có **hỗn hợp 2 loại bịch**:
> - `batch_1`: 5 bịch 200g (nhập 1kg=5 bịch, costPrice=12,000₫/bịch)
> - `batch_2`: 4 bịch 500g (nhập 1kg=2 bịch, costPrice=30,000₫/bịch)
>
> Khách đến mua **1 bịch 500g**.

---

### Vấn đề 1 — Hệ thống không phân biệt được "loại bịch" nào

**Hiện tại, variant `BT001` chỉ có 1 `sellUnit = "bịch"`.**  
Khi khách mua `quantity=1`, hệ thống chỉ biết "trừ 1 bịch" nhưng **không biết bịch 200g hay 500g**.

```
Khách order: BT001, qty=1

InvoiceService:
  variant.stockQty = 9 bịch (5 bịch 200g + 4 bịch 500g)
  stockQty >= 1 → OK ✅ (không báo lỗi)

FEFO deduct:
  batch_1.expiryDate = 2024-06-01 (hết hạn sớm hơn) → deduct TRƯỚC
  → Trừ 1 bịch từ batch_1 (bịch 200g, costPrice=12,000₫)
  → unit_cost_snapshot = 12,000₫

→ Khách nhận bịch 200g, nhưng muốn bịch 500g ← SAI VỀ LOGIC NGHIỆP VỤ ❌
```

**Root cause:** Cùng 1 variant `BT001` đang đại diện cho 2 sản phẩm vật lý **KHÁC NHAU** (200g vs 500g). Hệ thống không có cách phân biệt.

---

### Vấn đề 2 — Giá bán sai

```
variant.sellPrice chỉ có 1 giá duy nhất, VD: 9,000₫

Bịch 200g → giá đúng = 9,000₫/bịch ✅
Bịch 500g → giá đúng = 22,500₫/bịch ← nhưng hệ thống vẫn tính 9,000₫ ❌
```

---

### Vấn đề 3 — Tồn kho thống kê bị sai nghĩa

```
variant.stockQty = 9 bịch

Thực tế:
  5 bịch 200g = 1,000g
  4 bịch 500g = 2,000g
  Tổng = 3,000g = 3kg

Nhưng nếu đọc stockQty = 9 bịch mà không biết loại nào
→ báo cáo tồn kho mất ý nghĩa vật lý
```

---

### Tóm tắt: Đây là vấn đề thiết kế sâu hơn

| Câu hỏi | Trả lời |
|---------|---------|
| Hệ thống có bị crash không? | ❌ Không crash, nhưng logic sai |
| Khách có nhận đúng hàng không? | ❌ Không — FEFO tự chọn batch cũ nhất, không theo "loại bịch" |
| Giá vốn có đúng không? | ❌ Không chắc — tùy batch nào bị deduct |
| Giá bán có đúng không? | ❌ Không — 1 sellPrice cho tất cả loại bịch |
| Báo cáo lãi/lỗ có đúng không? | ❌ Không nếu 2 loại bịch có giá vốn khác nhau |

---

### Nguyên nhân gốc rễ

```
BT001 (variant duy nhất)
  ├── sellUnit = "bịch"        ← mơ hồ: bịch nào?
  ├── sellPrice = 9,000₫       ← giá bịch nào?
  ├── stockQty = 9             ← tổng bịch, nhưng loại khác nhau
  └── batch_1: 5 bịch @12,000₫ ← bịch 200g
      batch_2: 4 bịch @30,000₫ ← bịch 500g ← 2 loại bịch chung 1 variant
```

**Kết luận:** Khi admin chia 1kg thành 2 loại bịch khác nhau (200g và 500g) và **bán cùng lúc**, đây thực chất là **2 sản phẩm khác nhau** về quy cách.

---

### Giải pháp đúng về mặt thiết kế

#### ✅ Option A: 2 Variant riêng biệt (ĐÚNG NHẤT)

```
SP gốc: BT001 (Bánh Tráng Rong Biển)
  ├── Variant: BT001-200G
  │     sellUnit = "bịch 200g"
  │     sellPrice = 9,000₫
  │     stockQty = 5 bịch
  │     batch: 5 bịch @12,000₫
  │
  └── Variant: BT001-500G
        sellUnit = "bịch 500g"
        sellPrice = 22,500₫
        stockQty = 4 bịch
        batch: 4 bịch @30,000₫
```

**Ưu điểm:**
- Tồn kho chính xác từng loại
- Giá bán riêng từng loại
- FEFO đúng từng loại
- Báo cáo lãi/lỗ chính xác

**Luồng nhập hàng:**
```
Nhập 3kg từ NCC:
  → Quyết định chia: 2kg → bịch 200g (pieces=5), 1kg → bịch 500g (pieces=2)
  → Tạo 2 receipt item:
     item 1: variantId=BT001-200G, qty=2kg, piecesOverride=5 → +10 bịch 200g
     item 2: variantId=BT001-500G, qty=1kg, piecesOverride=2 → +2 bịch 500g
```

---

#### 🟡 Option B: Dùng chung 1 variant + admin nhập đúng loại khi bán

```
Nếu chỉ có 1 loại bịch đang bán tại 1 thời điểm
(hôm nay bán 200g, tuần sau hết thì chuyển sang bán 500g)
→ chấp nhận được với 1 variant
→ Nhưng phải đảm bảo: khi còn tồn bịch 200g, không bán bịch 500g
```

**Hạn chế:** Không bán 2 loại cùng lúc. Phù hợp cửa hàng nhỏ chỉ bán 1 quy cách/thời điểm.

---

#### ❌ Option C: Dùng chung 1 variant + tracking bằng conversionNote

Không khả thi — hệ thống không đọc `conversionNote` để phân loại tồn kho.

---

### Kết luận & Khuyến nghị thực tế

> **Câu hỏi then chốt:** Admin có **bán cả 2 loại cùng lúc** không?

| Tình huống | Giải pháp |
|-----------|-----------|
| Chỉ bán 1 loại tại 1 thời điểm (chia xong lô 200g → bán hết → mới chia 500g) | **1 variant** + `piecesOverride` per-receipt. Đơn giản, đủ dùng. |
| Bán cả 2 loại song song | **2 variant riêng** (BT001-200G, BT001-500G). Đây là cách đúng nhất về nghiệp vụ. |
| Thỉnh thoảng đổi quy cách, khách không quan tâm loại nào | **1 variant**, chấp nhận sai số nhỏ về giá vốn. Phù hợp cửa hàng siêu nhỏ. |

**Khuyến nghị cho Nhà Đan Shop:**
- Nếu bán hàng có **bảng giá khác nhau theo trọng lượng** → bắt buộc dùng **2 variant**
- Nếu chỉ "chia bịch cho tiện bán, giá theo kg" → **1 variant + ghi chú**, chấp nhận giá vốn xấp xỉ
- Thêm **hướng dẫn trong UI**: "Nếu bán nhiều kích cỡ khác nhau, hãy tạo variant riêng cho mỗi kích cỡ"

---

## IX. Nếu chọn Option A (2 Variant riêng biệt) — Những logic nào còn cần làm?

> Câu hỏi: Với Option A, 5 điểm sau có còn cần triển khai không?

---

### Điểm 1: UI fix — Thêm field `piecesOverride` trong form phiếu nhập

**Với Option A: VẪN CẦN — nhưng vai trò thay đổi hoàn toàn**

Với 1 variant, `piecesOverride` dùng để "chia bịch tùy thời điểm".  
Với 2 variant (`BT001-200G` / `BT001-500G`), mỗi variant đã có `piecesPerUnit` cố định:
- `BT001-200G`: `piecesPerUnit = 5` (1kg = 5 bịch 200g) — **không đổi**
- `BT001-500G`: `piecesPerUnit = 2` (1kg = 2 bịch 500g) — **không đổi**

Tuy nhiên `piecesOverride` **vẫn cần** vì:
- NCC đôi khi giao 1kg = 4.8 bịch (lẻ gram, làm tròn thực tế)
- Admin muốn nhập đúng số bịch thực tế đếm được, không theo lý thuyết
- Form hiện tại **không có field này** → admin không thể nhập được

**Kết luận:** Cần thêm vào UI — nhưng không phải để "chia linh hoạt" mà để **điều chỉnh số thực tế**.

```
Form hiện tại (thiếu):
  [Sản phẩm: BT001-200G]  [SL: 3 kg]  [Giá/kg: 60,000]  [CK: 0%]  [HSD: ...]

Form cần có:
  [Sản phẩm: BT001-200G]  [SL: 3 kg]  [Giá/kg: 60,000]  [CK: 0%]
  [Số bịch/kg lần này: 5]  ← pre-fill từ variant.piecesPerUnit, editable
  → Live preview: "3 kg × 5 = 15 bịch | Giá vốn/bịch = 12,000₫"
```

---

### Điểm 2: Service validation — `piecesOverride` ưu tiên khi có

**Với Option A: VẪN CẦN — service logic đã đúng nhưng UI không gửi**

Đọc code `InventoryReceiptService` dòng 120–135:
```java
pieces = (itemReq.piecesOverride() != null && itemReq.piecesOverride() > 0)
        ? itemReq.piecesOverride()       // ← ưu tiên override
        : piu.get().getPiecesPerUnit();  // ← fallback về default
```

Logic BE đã đúng. Vấn đề là:

1. **Form UI** hiện tại gửi `piecesOverride: null` → BE luôn dùng `piecesPerUnit` của `ProductImportUnit`
2. Với Option A, `ProductImportUnit` của `BT001-200G` có `pieces=5` → **tự động đúng**
3. Nhưng nếu không có field override trong UI thì admin không thể sửa khi thực tế khác

**Kết luận:** BE không cần sửa. UI cần gửi `piecesOverride` từ field mới.

---

### Điểm 3: Flyway V31 — Thêm `sell_unit_snapshot`

**Với Option A: VẪN NÊN LÀM — giá trị tăng cao hơn**

Với 2 variant, `variant.sellUnit` rõ ràng hơn (`"bịch 200g"` vs `"bịch 500g"`).  
Nhưng nếu sau này admin **đổi tên sellUnit** (VD: `"bịch 200g"` → `"gói 200g"`), lịch sử phiếu nhập sẽ không còn biết lần đó nhập đơn vị gì.

`sell_unit_snapshot` trong `inventory_receipt_items` = **audit trail vĩnh viễn**.

```sql
-- V31: thêm sell_unit_snapshot
ALTER TABLE inventory_receipt_items
    ADD COLUMN sell_unit_snapshot VARCHAR(20) NULL
    COMMENT 'Snapshot sellUnit của variant tại thời điểm nhập — bất biến';

-- Backfill
UPDATE inventory_receipt_items iri
JOIN product_variants pv ON pv.id = iri.variant_id
SET iri.sell_unit_snapshot = pv.sell_unit
WHERE iri.sell_unit_snapshot IS NULL;
```

**Kết luận:** Nên làm, ưu tiên thấp nhưng chi phí rất thấp.

---

### Điểm 4: Fix `unit_cost_snapshot` = FEFO weighted avg ← **QUAN TRỌNG NHẤT**

**Với Option A: BẮT BUỘC PHẢI FIX — vấn đề vẫn còn nguyên**

Với 2 variant, mỗi variant có batch riêng, nhưng **vẫn có thể có nhiều batch**:

```
BT001-200G:
  batch_A: 15 bịch @12,000₫ (nhập tháng 1)
  batch_B: 10 bịch @13,500₫ (nhập tháng 2, giá NCC tăng)

Bán 20 bịch BT001-200G:
  FEFO deduct: 15 từ batch_A + 5 từ batch_B
  Giá vốn đúng: (15×12,000 + 5×13,500) / 20 = 12,375₫/bịch

  Hiện tại: unit_cost_snapshot = variant.costPrice = 13,500₫ ← SAI!
  Fix đúng:  unit_cost_snapshot = 12,375₫ (FEFO weighted avg)
```

**Bug này tồn tại độc lập với Option A hay Option B** — chỉ cần có >1 batch là xảy ra.  
Với Option A, mỗi variant có nhiều batch từ nhiều lần nhập → bug này **chắc chắn sẽ xảy ra thường xuyên**.

**Kết luận:** **PHẢI FIX** — đây là bug kế toán nghiêm trọng nhất.

Tin tốt: `ProductBatchService.deductStockFEFOAndComputeCost()` **đã tính đúng FEFO weighted avg** và trả về giá trị đúng. `InvoiceService` đã dùng kết quả này:

```java
// InvoiceService dòng ~140 — ĐÃ ĐÚNG!
BigDecimal fefoAvgCost = batchService.deductStockFEFOAndComputeCost(
        product.getId(), variant.getId(), itemReq.quantity());
// ...
item.setUnitCostSnapshot(fefoAvgCost.compareTo(BigDecimal.ZERO) > 0
        ? fefoAvgCost : variant.getCostPrice()); // ← fallback về variant.costPrice nếu fefoAvgCost = 0
```

**Vấn đề thực tế:** Fallback `variant.getCostPrice()` khi `fefoAvgCost = 0` — xảy ra khi **không có batch** (bán khi tồn kho = 0, hoặc batch rỗng do lỗi). Trường hợp này:
- Nếu `stockQty > 0` nhưng không có batch → **inconsistency trong DB** → cần fix riêng
- Nếu `stockQty = 0` → `InvoiceService` đã throw trước khi đến đây

**Kết luận:** Logic `unit_cost_snapshot` **đã đúng** trong InvoiceService (dùng FEFO). Chỉ cần đảm bảo **luôn có batch tương ứng với stockQty** → đây là vấn đề data integrity, không phải logic.

---

### Điểm 5: Update `ProductImportUnit.note`

**Với Option A: VẪN HỮU ÍCH — nhưng vai trò khác**

Với 2 variant, `ProductImportUnit` của `BT001-200G` đã rõ ràng:
- `importUnit = "kg"`, `sellUnit = "bịch 200g"`, `pieces = 5`
- `note` hiện tại đã có (`VARCHAR(100)`) — admin có thể điền sẵn "1kg=5 bịch 200g"

**Vấn đề:** Field `note` **đã có** trong entity `ProductImportUnit`. Chỉ cần UI expose nó.  
Hiện tại form variant (VariantManager) có thể chưa cho edit `ProductImportUnit.note`.

**Kết luận:** Không cần thêm field, chỉ cần đảm bảo UI hiển thị `note` khi quản lý variant.

---

## X. Bảng tổng kết: Còn cần làm gì với Option A?

| # | Logic | Cần làm? | Ưu tiên | Lý do |
|---|-------|----------|---------|-------|
| 1 | UI: Thêm field `piecesOverride` trong form phiếu nhập | ✅ **CÓ** | 🔴 HIGH | Form hiện thiếu — admin không thể nhập số bịch thực tế |
| 2 | BE: `piecesOverride` ưu tiên khi có | ✅ **ĐÃ ĐÚNG** — chỉ cần UI gửi | 🟡 LOW | Logic đúng rồi, không cần sửa BE |
| 3 | DB: Thêm `sell_unit_snapshot` | ✅ **NÊN LÀM** | 🟡 LOW | Audit trail cho lịch sử, chi phí thấp |
| 4 | Fix `unit_cost_snapshot` = FEFO avg | ✅ **ĐÃ ĐÚNG** trong InvoiceService | 🟢 OK | `fefoAvgCost` từ `batchService` đã dùng FEFO đúng rồi |
| 5 | `ProductImportUnit.note` editable | ✅ **NÊN LÀM** | 🟢 LOW | Field đã có, chỉ cần UI expose |

### Điều bổ sung QUAN TRỌNG khi dùng Option A:

| # | Việc cần làm thêm | Ưu tiên | Mô tả |
|---|-------------------|---------|-------|
| A1 | **UI: Chọn variant trong form phiếu nhập** | 🔴 CRITICAL | Form hiện để `variantId: null` → luôn dùng default variant. Phải có dropdown chọn variant (BT001-200G / BT001-500G) |
| A2 | **UI: Chọn variant khi bán hàng** | 🔴 CRITICAL | InvoiceForm phải cho chọn "BT001-200G" hay "BT001-500G" → đúng giá bán + đúng tồn kho |
| A3 | **UI: Tạo variant với sellUnit mô tả rõ** | 🟡 MEDIUM | `sellUnit = "bịch 200g"` thay vì `"bịch"` để phân biệt |
| A4 | **Hướng dẫn trong UI** | 🟡 MEDIUM | Tooltip/note: "Mỗi kích cỡ đóng gói = 1 variant riêng" |

### Điểm mấu chốt cần hiểu

```
Option A KHÔNG giải quyết được nếu:
  ✗ Form phiếu nhập vẫn gửi variantId = null
  ✗ Form bán hàng vẫn không cho chọn variant

Option A CHỈ hoạt động khi:
  ✓ Admin tạo đúng 2 variant: BT001-200G và BT001-500G
  ✓ Khi nhập hàng: chọn đúng variant + điền piecesOverride nếu cần
  ✓ Khi bán hàng: chọn đúng variant → FEFO deduct đúng batch → giá vốn đúng
```
