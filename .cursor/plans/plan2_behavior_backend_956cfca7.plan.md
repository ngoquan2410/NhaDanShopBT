---
name: plan2 behavior backend
overview: "Triển khai behavior thật cho các lỗi đã phân tích: inventory report/export theo filter, promotion engine đúng nghiệp vụ, checkout quote giữ snapshot, production giữ batch/cost/HSD, customer admin/signup đúng lịch sử, và UTF-8 guard."
todos:
  - id: inventory-report
    content: Fix inventory report totals and Excel export so all visible totals/files use the current filters.
    status: completed
  - id: promotion-model
    content: Add promotion buy-items migration, DTOs, compatibility mapping, and promotion engine fixes.
    status: completed
  - id: quote-shipping
    content: Update sales quote, pending order revalidation, and shipping discount handling while preserving carrier fees.
    status: completed
  - id: production-customer
    content: Fix production quick-create/preview/cost/expiry behavior and customer stats/signup linking.
    status: completed
  - id: frontend-promotions
    content: Update FE promotion admin form, cart persistence, checkout quote rendering, and error handling.
    status: completed
  - id: utf8-tests
    content: Add UTF-8 mojibake guard plus focused backend/frontend regression coverage.
    status: completed
isProject: false
---

# Plan 2 Cursor Behavior, FE UX Logic, Backend

## Summary

Triển khai phần behavior thật cho các lỗi đã phân tích: báo cáo tồn kho tính tổng và xuất Excel theo filter, promotion engine xử lý đúng Quà tặng / Mua X tặng Y / Miễn phí ship, checkout giữ promotion và quote đúng, production không làm sai stock/cost/HSD, customer admin tính đúng lịch sử mua, và đảm bảo mọi thay đổi nhạy cảm giữ business truth.

Plan này dành cho Cursor triển khai code FE + BE + migration + test. Lovable/UI-only không làm phần này.

## Business Truth Bắt Buộc Giữ

- Tồn kho là nguồn sự thật theo batch/movement, không update `stockQty` trực tiếp ngoài stock service chuẩn.
- Không âm tồn: bán hàng, quà tặng, sản xuất, điều chỉnh đều phải validate trong transaction.
- Quà tặng là xuất kho thật: giá bán 0đ nhưng vẫn trừ tồn, ghi cost/COGS, ảnh hưởng lợi nhuận.
- Không oversell khi quà trùng hàng mua: validate tổng `paidQty + giftQty` theo variant.
- Promotion không làm sai lịch sử: pending order/invoice phải dùng snapshot tại thời điểm quote/create order.
- Sửa/xóa promotion/voucher không đổi hóa đơn, doanh thu, lợi nhuận cũ.
- Free ship là discount thương mại, không làm mất carrier fee gốc từ GHN/fallback.
- Báo cáo doanh thu/lợi nhuận chỉ tính invoice `COMPLETED`.
- Inventory report filter nào thì tổng và file Excel theo filter đó, không lấy tổng toàn hệ thống khi UI đang lọc.
- Production output batch HSD là batch truth, tính từ nguyên liệu sớm nhất và shelf-life thành phẩm; không ghi đè `variant.expiryDays`.
- Chi phí sản xuất cập nhật giá vốn/batch cost, không tự đổi giá bán.
- Customer identity ưu tiên link theo SĐT chuẩn hóa, không tạo duplicate nếu match an toàn.
- Receipt/phiếu nhập kho không nằm trong scope này, trừ khi ảnh hưởng trực tiếp batch cost/HSD dùng cho production.

## Guardlist Không Được Vi Phạm

- Không hardcode ngưỡng free ship ở frontend.
- Không tính promotion bằng logic client rồi gửi reward line xuống backend.
- Không cho client tự gửi quà tặng như line thường.
- Không dùng `maxBuyQty` như “khách mua nhiều quá thì không được quà” nếu nghiệp vụ là “giới hạn số lần tặng”.
- Không tính Mua X tặng Y nhiều sản phẩm bằng tổng quantity gộp.
- Không apply free ship trong `/api/shipping/quote`.
- Không set `fee = 0` ở shipping quote chỉ vì zone threshold.
- Không update giá bán từ production cost.
- Không update `variant.expiryDays` từ output expiry date.
- Không sửa/xóa batch đã bán/đã dùng sản xuất.
- Không để FE nuốt lỗi backend bằng toast chung chung.
- Không để migration phá dữ liệu promotion cũ.
- Không làm hỏng `% giảm giá` và `Giảm cố định` đang chạy đúng.
- Không tạo text tiếng Việt lỗi encoding/mojibake.
- Không xuất Excel tồn kho bằng dataset toàn bộ nếu UI đang có filter category/search/date.

## Implementation Scope

### Inventory Report Behavior

Hệ thống đang dùng API export server-side, nên frontend export request phải gửi đầy đủ filter hiện tại lên backend: `from`, `to`, `categoryId` hoặc `categoryName` theo API hiện có, `keyword/search`, và `sort`. Backend export endpoint phải áp dụng cùng filter với report/list.

Trong `InventoryReport`, `filteredRows` là source duy nhất cho `totalClosingStock`, `totalClosingValue`, `lowStockCount`, `outOfStockCount`, và table footer total. Export Excel phải gọi server-side export với đúng filter state hiện tại.

Excel export mặc định phải xuất toàn bộ rows theo filter, không chỉ page hiện tại. Nếu đang lọc danh mục, Excel chỉ chứa sản phẩm thuộc danh mục đó. Filename/header nên phản ánh filter hiện tại, ví dụ `bao-cao-ton-kho_YYYY-MM-DD.xlsx` hoặc `bao-cao-ton-kho_Rong-Bien_YYYY-MM-DD.xlsx`.

Acceptance:
- Chọn danh mục `Rong Biển`, bảng còn 3 rows thì footer và stat card chỉ cộng 3 rows.
- Bấm `Xuất Excel` khi đang lọc `Rong Biển` thì file Excel chỉ có 3 rows `Rong Biển`.
- Search keyword + category cùng lúc thì Excel chỉ chứa rows match cả hai.
- Date range thay đổi thì Excel dùng đúng date range.

### Promotion Data Model

Thêm bảng mới `promotion_buy_items` để biểu diễn đúng rule multi-product BUY_X_GET_Y, ví dụ `Mua 3 sản phẩm A + 3 sản phẩm B tặng 1 sản phẩm C` phải là `qty(A) >= 3 AND qty(B) >= 3`, không phải cộng gộp quantity.

Fields:
- `id`
- `promotion_id`
- `product_id`
- `buy_qty`
- `sort_order`
- `created_at`
- `updated_at`

Constraints:
- FK `promotion_id -> promotions.id`
- FK `product_id -> products.id`
- unique `(promotion_id, product_id)`
- `buy_qty > 0`

Migration dữ liệu cũ:
- Với promotion `BUY_X_GET_Y` có `promotion_products`, tạo một row trong `promotion_buy_items` cho mỗi product.
- `buy_qty` lấy từ `promotions.buy_qty`.
- Giữ cột cũ `buy_qty` để backward compatible trong giai đoạn đầu.
- Không xóa `promotion_products` ngay vì đang dùng cho scope của các loại promotion khác.

DTO/API thêm `buyItems` và `repeatable` vào `PromotionRequest` và `PromotionResponse`. Nếu request có `buyItems`, dùng `buyItems`; nếu không có nhưng có `productIds + buyQty`, convert sang `buyItems`. Response vẫn giữ `productIds` để frontend cũ không vỡ, frontend mới dùng `buyItems`.

Với `repeatable`, kiểm tra nếu DB/entity đã có field repeat tương đương thì map sang `repeatable`. Nếu chưa có, thêm column `repeatable boolean not null default true` vào `promotions`. Nếu request cũ không gửi giá trị, default `repeatable = true` để tương thích UI hiện tại có checkbox “Lặp lại theo bộ số”.

### Promotion Engine Backend

Giữ nguyên behavior hiện tại cho percent discount và fixed discount, chỉ thêm regression cho `minOrderValue`, `maxDiscount`, scope product/category/all, inactive/expired, max eligible subtotal guard, và snapshot vào quote/invoice.

BUY_X_GET_Y phải sửa trong promotion evaluation API, sales quote API, và pending order creation/revalidation nếu có path riêng. Eligibility phải lấy paid cart lines, không tính reward lines. Với mỗi `buyItem`, tính `cartQtyByProduct[productId]` và check từng product. Nếu `repeatable = true`, `times = min(floor(cartQty(productId) / buyQty) for each buyItem)`. Nếu `repeatable = false`, `times = 1` khi tất cả buyItems đủ điều kiện. Gift qty = `getQty * times`.

Validate gift product active/not deleted/default variant sellable/còn tồn sellable. Nếu gift variant trùng paid variant, validate aggregate stock `paidQty + rewardQty <= availableQty`.

Quantity Gift phải hỗ trợ đúng ba trigger:
- Đơn tối thiểu: `minOrderValue > 0`, `productIds = []`, `minBuyQty = null`, không reject vì `minBuyQty == null`.
- Mua SP chỉ định: `productIds = [triggerProductId]`, `minBuyQty = 1`.
- Mua đủ SL: `productIds = [triggerProductId]`, `minBuyQty = requiredQty`, dùng `repeatable` nếu UI bật lặp. Nếu `repeatable = true`, `times = floor(qty / minBuyQty)`. Nếu `repeatable = false`, `times = 1`. Cap chỉ giới hạn số lần reward, không reject khi khách mua nhiều hơn.

Gift cap chốt dùng tên domain/API `maxGiftApplications` cho `QUANTITY_GIFT`, map vào/ra từ DB column hiện có `max_buy_qty`. Không migrate DB cho gift cap và không dùng tên `maxBuyQty` trong FE/domain mới cho `QUANTITY_GIFT`. `maxGiftApplications` nghĩa là giới hạn số lần tặng, không phải giới hạn số lượng khách được mua. Ví dụ mua đủ 5 tặng 1, `maxGiftApplications = 4`, khách mua 30 thì chỉ tặng tối đa 4 lần, không báo lỗi.

Free Shipping promotion chỉ apply ở cart evaluation/sales quote layer, không sửa `/api/shipping/quote`. Sales quote phải giữ `shippingFee`, `shippingDiscount`, `shippingFeeAfterDiscount`, và promotion snapshot.

### Sales Quote Và Checkout Backend

Quote request FE gửi paid cart lines, selected `promotionId`, voucher code nếu có, shipping address, selected payment method nếu cần, và loyalty points nếu có. FE không gửi reward lines.

Quote response cần đủ `subtotal`, `productDiscount`, `shippingFee`, `shippingDiscount`, `total`, `rewardLines`, `promotionSnapshot`, `promotionReason` nếu selected promotion fail, `fallbackPromotionId` nếu có suggestion, và `quotePublicId`.

Nếu FE gửi `promotionId`, backend ưu tiên evaluate promotion đó. Nếu hợp lệ thì apply đúng promotion đó; nếu không hợp lệ thì trả reason, không silently bỏ mất. Nếu có best promo khác thì trả fallback suggestion.

Khi tạo pending order, backend dùng `quotePublicId` server-side, revalidate quote trong transaction, revalidate stock aggregate paid + gift, snapshot promotion/voucher/reward/shipping vào pending order, và không phụ thuộc promotion live sau khi order đã tạo.

### Frontend Promotion Logic

Admin Promotion Form:
- BUY_X_GET_Y mapper gửi `buyItems`, không chỉ gửi `productIds + buyQty`.
- BUY_X_GET_Y mapper gửi/nhận `repeatable`; nếu promotion cũ không có giá trị thì default `repeatable = true`.
- Khi load promotion cũ, nếu response có `buyItems` thì render từng row đúng qty; nếu chỉ có `productIds + buyQty`, render từng row với cùng qty.
- Quantity Gift mapper theo đúng trigger: đơn tối thiểu, mua SP chỉ định, mua đủ SL.
- `giftStockLimit` hoặc cap UI phải map sang `maxGiftApplications`, không dùng `maxBuyQty` trong FE/domain mới cho `QUANTITY_GIFT`. Backend map `maxGiftApplications` vào/ra từ DB column `max_buy_qty`.

Cart:
- Gọi evaluate API với lines, subtotal, selectedPromotionId nếu có.
- Hiển thị eligible promotions, near-miss/progress, selected promotion.
- Không hardcode free ship threshold.
- Khi user chọn promotion, lưu vào cart state/localStorage và pass sang checkout.
- Nếu selected promotion biến mất, clear selected id và show warning.

Checkout:
- Quote call luôn gửi `promotionId` đã chọn.
- Khi address/shipping thay đổi, refetch shipping quote và sales quote với cùng `promotionId`.
- Không reset promotion trừ khi backend báo invalid.
- Summary render từ server quote, không tự tính lại bằng client.

### Shipping Backend

`/api/shipping/quote` phải là carrier/fallback truth. Nếu GHN trả `29000`, response `fee = 29000`; không set free ship tại tầng carrier. Remove/sửa logic như `applyFreeShip(fee, subtotal, provinceCode)` hoặc `isFreeShip(subtotal, provinceCode, zone config)`. Zone config chỉ dùng cho base fee fallback, surcharge, ETA, và service availability.

Free ship chỉ apply trong sales/pricing quote khi có voucher free ship hợp lệ hoặc promotion `FREE_SHIPPING` hợp lệ. Giữ carrier fee gốc trong snapshot để đối soát.

### Production Behavior

Quick Create Master Data:
- Cursor phải kiểm tra endpoint product/variant hiện tại trước. Nếu endpoint hiện có có thể tạo product + default variant + set `isSellable`, FE production quick-create dùng lại endpoint đó.
- Chỉ thêm endpoint quick-create mới nếu endpoint hiện có không đáp ứng được việc tạo nguyên liệu nhanh với `isSellable = false`, tạo thành phẩm nhanh với `isSellable = true`, và tạo product/variant tối thiểu trong một request.
- Ingredient default `isSellable = false`, active, category required, unit fields required.
- Output product default `isSellable = true`, active, category required.
- Quick-create chỉ tạo master data. Không tạo batch, không tạo stock movement, không tăng tồn.

BOM Unit Auto-fill:
- Recipe API response cho variant cần `stockUnit`, `sellUnit`, `importUnit`, `conversionRate`, `availableQty`, `nearestExpiryDate`.
- FE chọn variant thì auto-fill unit theo rule hiện có, vẫn cho admin override.

Production Preview:
- Tính raw material FEFO allocation preview, output unit cost, overhead per unit, output expiry date, và limiting raw batch nếu expiry bị nguyên liệu giới hạn.

Output Expiry Date:
- `rawMinExpiry = min(expiryDate của raw batches consumed)`
- `variantShelfExpiry = productionDate + outputVariant.expiryDays nếu có`
- `outputExpiryDate = min(rawMinExpiry, variantShelfExpiry)` nếu cả hai có
- Không cập nhật `variant.expiryDays`.

Output Cost:
- Output batch cost = raw material cost + overhead allocation.
- Có thể cập nhật `variant.costPrice` thành latest output unit cost nếu hệ thống đang dùng field đó làm giá vốn tham khảo.
- Không cập nhật `variant.sellPrice`.

Storefront availability phải không bán batch hết hạn. Nếu variant còn `stockQty` aggregate nhưng toàn batch expired, storefront phải coi là hết hàng.

### Customer Admin Và Signup Link

`CustomerResponse` cần có `totalSpend`, `orderCount`, `lastPurchaseAt`. Tính từ invoice `COMPLETED`, primary match theo `customer_id`, fallback normalized phone nếu invoice/customer link thiếu. Không tính pending/canceled/draft.

Khi customer signup storefront:
- Normalize phone.
- Tìm customer POS active cùng phone.
- Nếu đúng 1 match, link user vào customer đó, không tạo customer mới.
- Nếu nhiều match, chọn customer có completed invoice gần nhất và flag duplicate để admin xử lý sau.
- Nếu không match, tạo customer mới.

Không merge dữ liệu phá lịch sử và không tự xóa duplicate cũ trong bước signup.

### UTF-8 Guard

Thêm source check trước build/test để fail nếu source có mojibake patterns: `Ã`, `Â`, `áº`, `á»`, `Ä`, `Æ`, `â€”`, `â†’`.

Chạy trên:
- FE `src`
- BE `src/main/java`
- BE `src/main/resources`

Không scan binary/image/build artifacts.

## API / Type Changes

`PromotionRequest` add:

```ts
buyItems?: Array<{
  productId: number;
  buyQty: number;
}>;

maxGiftApplications?: number;
repeatable?: boolean;
```

Keep legacy:

```ts
productIds?: number[];
buyQty?: number;
maxBuyQty?: number;
```

`PromotionResponse` add:

```ts
buyItems?: Array<{
  productId: number;
  productName: string;
  productCode?: string;
  buyQty: number;
}>;

maxGiftApplications?: number;
repeatable?: boolean;
```

Promotion Evaluation Response add/ensure:

```ts
eligible: boolean;
reason?: string;
progress?: {
  type: "amount" | "quantity" | "multi_quantity";
  remainingAmount?: number;
  requiredAmount?: number;
  items?: Array<{
    productId: number;
    productName: string;
    requiredQty: number;
    currentQty: number;
    missingQty: number;
  }>;
};
rewardLines?: Array<{
  productId: number;
  variantId: number;
  name: string;
  qty: number;
}>;
shippingDiscountPreview?: {
  maxDiscount?: number;
  pendingAddress: boolean;
};
```

Sales Quote Response ensure:

```ts
shippingFee: number;
shippingDiscount: number;
shippingFeeAfterDiscount: number;
promotionSnapshot?: object;
rewardLines: RewardLine[];
selectedPromotionInvalidReason?: string;
fallbackPromotionId?: number;
```

`CustomerResponse` add:

```ts
orderCount: number;
lastPurchaseAt?: string;
```

Inventory Export Request ensure:

```ts
from?: string;
to?: string;
categoryId?: number;
categoryName?: string;
keyword?: string;
sort?: string;
```

## Migration Plan

Migration 1: `promotion_buy_items`
- Create table.
- Backfill from existing `BUY_X_GET_Y` rows: each `promotion_products.product_id`, `buy_qty = promotions.buy_qty || 1`.
- Add indexes.

Migration 2: `repeatable` nếu chưa có field tương đương
- Kiểm tra DB/entity hiện tại có field repeat tương đương không.
- Nếu đã có, map field đó sang API/domain `repeatable`.
- Nếu chưa có, add `promotions.repeatable boolean not null default true`.
- Backward compatibility: request/row cũ không có giá trị thì default `repeatable = true`.

Gift Cap Naming Decision
- Không migrate DB cho gift cap.
- Giữ nguyên DB column `max_buy_qty`.
- Backend service/domain/API expose `maxGiftApplications` cho `QUANTITY_GIFT`.
- Map `maxGiftApplications` vào/ra từ column `max_buy_qty`.
- Legacy `maxBuyQty` chỉ giữ để nhận request/response cũ nếu cần compatibility, không dùng trong FE/domain mới cho `QUANTITY_GIFT`.

## Test Plan Backend

Inventory:
- Category filter returns visible rows; frontend unit test confirms totals from filtered rows.
- Search + category combined totals correct.
- Export Excel with category filter only includes that category.
- Export Excel with category + search + date includes only rows matching all filters.
- Export Excel without filter includes all report rows for selected date range.

BUY_X_GET_Y:
- A qty 3 + B qty 3 => eligible.
- A qty 2 + B qty 1 => ineligible with both missing details.
- A qty 2 + B qty 1 but total 3 => still ineligible.
- A qty 6 + B qty 3 with `repeatable = true` => times 1.
- A qty 6 + B qty 6 with `repeatable = true` => times 2.
- A qty 6 + B qty 6 with `repeatable = false` => times 1.
- Gift product out of stock => ineligible.
- Gift same as paid product, paid 5 + gift 1, stock 5 => reject/ineligible.

Quantity Gift:
- Min order 10k, cart 42k => eligible.
- Min order with `minBuyQty = null` must not fail.
- Product-specific qty 1 => eligible only when product exists.
- Buy enough qty 5 => eligible only when that product qty >= 5.
- Buy qty 10 with `repeatable = true` and min qty 5 => reward times 2.
- Buy qty 10 with `repeatable = false` and min qty 5 => reward times 1.
- Buy qty 30 with cap `maxGiftApplications = 4` and min qty 5 => reward times capped at 4, not rejected.

Free Shipping:
- `/api/shipping/quote` GHN fee 29000 => response fee 29000.
- No voucher/promo => quote total includes 29000.
- Free ship promo min 350k cap 20000 + fee 29000 => shipping discount 20000, customer pays 9000.
- Free ship promo max blank + fee 29000 => discount 29000.
- Cart evaluation before address returns progress/eligible pending address.

Sales Quote/Pending:
- Selected promotion remains applied after shipping quote.
- Invalid selected promotion returns reason.
- Pending order creation revalidates reward stock.
- Invoice snapshot remains unchanged after promotion edit/delete.

Production:
- Quick create ingredient does not create stock/batch.
- Quick create ingredient default not sellable.
- Quick create output default sellable.
- Output expiry picks earliest between raw batch expiry and variant shelf-life.
- Output cost includes overhead.
- Sell price unchanged.
- Expired output batch not sellable.

Customer:
- Customer with completed invoices shows correct totalSpend/orderCount.
- Pending/canceled orders not counted.
- Signup phone matches POS customer and links instead of creating duplicate.
- Multiple phone matches chooses latest invoice and flags duplicate.

UTF-8:
- Guard fails on seeded mojibake string.
- Guard passes current corrected source.

## Test Plan Frontend

Inventory:
- Filter category updates stat cards and footer.
- Search + category + date together update totals.
- Clear filter restores full totals.
- Export Excel while category is selected sends category/search/date/sort filters to server-side export.
- Export Excel output does not include rows outside selected category.
- Filename/header reflects selected category when applicable.

Admin Promotion Form:
- BUY_X_GET_Y with two buy rows sends `buyItems` with separate qty and `repeatable`.
- Loading old promotion without `buyItems` still renders product rows.
- Gift min-order sends `minOrderValue`, no `productIds`, no `minBuyQty`.
- Gift product-specific sends product id + `minBuyQty = 1`.
- Gift buy-quantity sends product id + required qty, `repeatable`, and `maxGiftApplications` if cap is set.
- Free ship sends min order + max discount.

Cart:
- Min-order gift appears when subtotal qualifies.
- Quantity gift appears when product qty qualifies.
- BUY_X_GET_Y does not appear when total qty qualifies but one product lacks required qty.
- Free ship progress appears only from backend promotion data.
- No hardcoded free ship banner.

Checkout:
- Selected promotion from cart persists after address/shipping changes.
- Server quote drives all totals.
- Free ship cap displays as shipping discount, not carrier fee zero.
- Gift lines render from backend reward lines.
- Invalid promotion reason visible.

Production:
- BOM quick create opens modal in page.
- Create ingredient auto-selects and fills unit.
- Output quick create auto-selects output.
- Preview displays output expiry reason and cost.

## Rollout Order

1. Add backend tests for current failing promotion/shipping/customer cases.
2. Add migration `promotion_buy_items`, plus `repeatable` only if no equivalent field exists.
3. Update BE promotion entity/DTO/service mapping.
4. Fix BE promotion evaluation for BXY, quantity gift, free ship progress.
5. Fix BE sales quote and pending order revalidation.
6. Fix shipping quote to preserve carrier fee.
7. Fix customer stats/signup linking.
8. Add production quick-create support and preview expiry/cost fields.
9. Update FE admin promotion mapper/types.
10. Update FE cart/checkout promotion persistence and rendering logic.
11. Update FE inventory totals from filtered rows.
12. Update inventory Excel export to use the same filter state as the report.
13. Add UTF-8 guard.
14. Run full backend + frontend regression.
15. Manual smoke on admin promotion, cart, checkout, inventory, inventory export, production.

## Assumptions

- `% giảm giá` và `Giảm cố định` đang đúng nên chỉ thêm regression, không refactor lớn.
- Gift cap chốt không migrate DB: `maxGiftApplications` map vào/ra từ `max_buy_qty`, và không dùng `maxBuyQty` trong FE/domain mới cho `QUANTITY_GIFT`.
- `repeatable` default `true` khi request/data cũ không có giá trị để tương thích UI hiện tại.
- Free ship progress ở cart cần backend evaluation trả near-miss/eligible pending address.
- Production quick create ưu tiên dùng endpoint product/variant hiện có nếu đáp ứng được; chỉ thêm endpoint mới khi cần. Quick-create chỉ tạo product/variant master data, không tạo tồn.
- Customer signup có phone hoặc sẽ bổ sung phone vào request.
- Nếu nhiều customer cùng phone, không merge tự động; chỉ link theo rule an toàn và flag duplicate.
- Inventory Excel export mặc định phải xuất toàn bộ dữ liệu theo filter hiện tại, không chỉ page hiện tại.