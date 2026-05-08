---
name: dashboard-pending-selenium
overview: Sửa dashboard tồn kho/HSD, product filter, pending order visibility, stock adjustment UI, production API/page flow, logout cart, combo checkout, address autocomplete và thay Playwright bằng Selenium automation full-flow.
todos:
  - id: ui-theme-behavior-audit
    content: Đọc và áp dụng chuẩn behavior/theme/CSS của nha-dan-pos-c091ee5b trước khi sửa admin/storefront pages.
    status: completed
  - id: dashboard-four-alerts
    content: Chia dashboard thành 4 card sắp hết hàng, hết hàng, sắp hết HSD, hết HSD; bỏ dữ liệu pending giả.
    status: completed
  - id: product-category-dropdown
    content: Đổi filter danh mục sản phẩm sang dropdown responsive, không phá layout.
    status: completed
  - id: pending-order-visibility
    content: Fix guest/user tạo pending order nhưng admin không thấy; bổ sung lỗi rõ ràng và refresh/list đúng.
    status: completed
  - id: stock-adjustment-ui-data
    content: Fix Kiểm kho/Điều chỉnh API có data nhưng UI không hiển thị danh sách/empty state sai.
    status: completed
  - id: production-recipe-api-bytea
    content: Fix production recipes API 500 lower(bytea) và regression cho query null/blank/text.
    status: completed
  - id: production-recipe-page-flow
    content: Chuyển Tạo quy trình sản xuất từ modal sang page riêng đúng behavior/theme UI admin.
    status: completed
  - id: logout-cart-clear
    content: Khi đăng xuất phải clear giỏ hàng/session cart để không giữ item của user trước.
    status: completed
  - id: combo-storefront-purchase
    content: "Cho storefront mua combo thật: add cart, quote, pending order, invoice trừ đúng component stock."
    status: completed
  - id: address-autocomplete-frontstore
    content: Fix autocomplete địa chỉ frontstore còn lỗi, fallback manual không block checkout.
    status: completed
  - id: selenium-automation-stack
    content: Bỏ Playwright, thêm Selenium automation runner/helpers/full-flow storefront + admin.
    status: completed
  - id: verification-gates
    content: Chạy compile/test backend, build/unit frontend, Selenium automation và manual smoke theo tiêu chí done.
    status: completed
isProject: false
---

# Dashboard Pending Selenium Plan

## Mục Tiêu
- Sửa các lỗi UI/API đang thấy trên dashboard, sản phẩm, pending order, kiểm kho, sản xuất, checkout địa chỉ, logout cart và combo checkout.
- Thay test E2E Playwright bằng Selenium/WebDriver automation full-flow cho storefront + admin.
- Đưa mỗi issue về tiêu chí done rõ ràng, không chỉ “sửa cho hết lỗi”.

## Ràng Buộc Triển Khai
- Không sửa plan auth cũ; file này là scope triển khai mới.
- Không che lỗi bằng empty state giả. Nếu API có data mà UI không hiển thị, phải tìm đúng mismatch mapper/pagination/status/filter.
- Không giữ mock/runtime data trong production path. Demo/dev-only phải ghi rõ và không chạy trong flow bán hàng thật.
- Không nới security để thấy data. Admin list vẫn cần admin JWT; guest/user chỉ được tạo và xem pending order public theo endpoint cho phép.
- Không làm sai [`c:/Work/NhaDanShopBT/docs/backend-integration-pack.md`](c:/Work/NhaDanShopBT/docs/backend-integration-pack.md): batch là stock truth, pending/invoice giữ snapshot, combo phải trừ stock component đúng.
- UI phải theo pattern của `nha-dan-pos-c091ee5b`: `PageHeader`, dense admin layout, card/page flow, `AsyncBoundary`, `EmptyState`, responsive grid. Form lớn như production recipe phải là page riêng, không modal lớn.
- Mặc định `sắp hết hạn sử dụng` = batch còn hạn trong 30 ngày; `hết hạn sử dụng` = expiryDate < hôm nay. Nếu backend có config ngưỡng HSD thì dùng config đó.

## Definition Of Done Chung
- Không còn blank page hoặc “không có dữ liệu” sai khi API trả data.
- Lỗi auth/API hiển thị rõ, có retry hoặc hướng xử lý.
- Backend compile/test pass, frontend build pass.
- Selenium automation chạy được full-flow chính hoặc báo blocker môi trường cụ thể.
- Final report nêu rõ test đã chạy, test chưa chạy, residual risk.

## 1. Audit Behavior / Theme / CSS Chuẩn
- Đọc các page chuẩn đang dùng tốt: Dashboard, Products, GoodsReceiptCreate, POS, StockAdjustmentCreate, shared components.
- Chốt pattern dùng lại:
  - Page phức tạp dùng route riêng + `PageHeader`, không modal dài.
  - Filter dùng toolbar/dropdown responsive, không horizontal overflow.
  - API loading/error/empty dùng component nhất quán.

### Done
- Các màn sửa không còn modal/form lệch theme như ảnh production hiện tại.
- Mobile/tablet/desktop không overflow filter/form chính.

## 2. Dashboard Chia 4 Khung Cảnh Báo
- Cập nhật [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/Dashboard.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/Dashboard.tsx).
- Tách thành 4 card:
  - `Sắp hết hàng`: available > 0 và <= minStock/threshold.
  - `Hết hàng`: available <= 0.
  - `Sắp hết hạn sử dụng`: batch expiry trong 30 ngày, chưa hết hạn.
  - `Hết hạn sử dụng`: batch expiry trước hôm nay.
- Bỏ pending summary giả `DH-20250415-001`; dùng item thật gần nhất hoặc empty state.

### Done
- Dashboard hiển thị đúng 4 card với count và 5-6 dòng mới nhất.
- Ảnh user gửi không còn bị gộp “hết hàng” và “sắp hết hạn” sai nghĩa.
- Card không vỡ layout ở 1366px, tablet và mobile.

## 3. Product Category Filter Dạng Dropdown
- Cập nhật [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/Products.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/Products.tsx).
- Thay dải button category bằng dropdown (`Select` hoặc `<select>` theo style đang dùng).
- Giữ backend filter `productService.list({ categoryId })`.

### Done
- Filter danh mục không còn kéo ngang/phá layout.
- Chọn danh mục reload đúng danh sách sản phẩm.
- Có option “Tất cả danh mục”.

## 4. Pending Order Guest/User Tạo Nhưng Admin Không Thấy
- Rà flow:
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Checkout.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Checkout.tsx)
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPendingOrderAdapter.ts`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPendingOrderAdapter.ts)
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/PendingOrders.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/PendingOrders.tsx)
  - [`c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/security/SecurityConfig.java`](c:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/security/SecurityConfig.java)
- Fix guest/user checkout để lỗi quote/order create hiện toast rõ, không im lặng.
- Admin pending list phải refresh/list đúng Page response, tab/status đúng.

### Done
- Guest tạo pending order xong thấy `/pending-payment/:id`.
- User đăng nhập tạo pending order xong admin thấy đơn mới sau refresh.
- Admin click `Xem` mở detail, không trắng trang.
- 403/401 hiển thị auth error, không hiện empty sai.

## 5. Kiểm Kho / Điều Chỉnh API Có Data Nhưng UI Không Hiển Thị
- Cập nhật [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustments.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/StockAdjustments.tsx).
- Rà adapter [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adminBackend.ts`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adminBackend.ts) và backend `/api/stock-adjustments`.
- Kiểm các mismatch:
  - API trả `Page` nhưng adapter đọc array.
  - Field lệch `createdAt/createdDate`, `items/itemCount`, status uppercase/lowercase.
  - Filter default làm biến mất data.
  - Empty state dùng `filtered.length` trong khi `data.total > 0`.

### Done
- API trả ít nhất 1 phiếu thì UI desktop/mobile render đúng.
- Search/status filter không làm mất data ngoài ý muốn.
- Detail drawer mở được record thật.
- Có mapper test hoặc Selenium/admin smoke.

## 6. Production Recipes API 500 `lower(bytea)`
- Fix backend lỗi `function lower(bytea) does not exist` ở `/api/production-recipes`.
- Rà entity/schema/migration/query:
  - `recipe_code` phải là text/varchar/String, không bytea.
  - Migration convert bytea local DB sang varchar an toàn và idempotent.
  - Query search không gọi `lower()` trên cột sai type.
- Thêm backend regression cho `q` null, blank, text và filter status.

### Done
- `/api/production-recipes?page=0&size=100&sort=id,desc` không 500.
- UI Production load recipe list không toast lỗi.
- Migration chạy được trên DB mới và DB local đã có bytea.

## 7. Production “Tạo Quy Trình” Là Page Riêng
- Cập nhật routing trong [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/App.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/App.tsx):
  - `/admin/production/recipes/new`
  - `/admin/production/recipes/:id/edit` nếu edit nằm trong scope.
- Tách form khỏi modal trong [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/Production.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/Production.tsx).
- Page form dùng `PageHeader`, back link, card sections, responsive grid, `SearchableCombobox`/`Select` cho SP/variant/nguyên liệu.
- Giữ contract: chọn finished variant có sẵn; nếu thiếu thì CTA tạo sản phẩm.

### Done
- Nút `Tạo quy trình` mở page riêng, không mở modal.
- Form không overflow, theme khớp admin.
- Save thành công quay lại `/admin/production` và recipe xuất hiện.
- Cancel/back không để backdrop/dialog treo.

## 8. Logout Phải Clear Giỏ Hàng
- Rà [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx) và [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/lib/cart.ts`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/lib/cart.ts).
- Khi `signOut()` hoàn tất, clear cart/local cart state.
- Slice này ưu tiên không leak item giữa accounts; cart guest keyed riêng để sau.

### Done
- Add item, logout, login account khác: cart trống.
- Logout từ storefront/admin đều clear cart.
- Refresh token thành công không clear cart.

## 9. Combo Chưa Mua Được Từ Storefront
- Rà:
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Combos.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Combos.tsx)
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/components/storefront/ComboCard.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/components/storefront/ComboCard.tsx)
  - backend combo/quote/pending/invoice handling.
- Preferred contract: cart supports combo line with `comboId`; backend quote expands components for stock/cost while preserving combo sale snapshot.
- Không fake combo thành product thường nếu backend không trừ component stock đúng.

### Done
- Active combo đủ tồn có thể add cart từ storefront.
- Checkout quote/pending/invoice giữ combo name/price snapshot.
- Confirm invoice trừ stock component đúng một lần.
- Combo hết hàng disable purchase và báo rõ.

## 10. Address Autocomplete Frontstore Còn Lỗi
- Rà:
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/components/shared/AddressAutocomplete.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/components/shared/AddressAutocomplete.tsx)
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Checkout.tsx`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Checkout.tsx)
  - backend `AddressController` / `GoongAddressService`.
- Missing Goong key/quota/network must fallback to manual address, not block checkout.
- Goong missing ward/commune must allow manual completion.

### Done
- Thiếu `GOONG_REST_API_KEY` vẫn checkout bằng địa chỉ thủ công được.
- Autocomplete mismatch không trap user trong invalid state.
- Retry fallback hoạt động, không spam banner.

## 11. Replace Playwright With Selenium Automation
- Remove active Playwright runner/config/specs/dependency:
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/playwright.config.ts`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/playwright.config.ts)
  - [`c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/e2e/run-e2e.mjs`](c:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/e2e/run-e2e.mjs)
  - `@playwright/test`, `test:e2e:*`
- Add Selenium:
  - `selenium-webdriver`
  - `automation/selenium/run-selenium.mjs`
  - helpers for driver, login, screenshots, seeded API calls.
- Coverage:
  - Guest checkout pending.
  - User checkout pending.
  - Admin dashboard 4 cards.
  - Admin pending view/confirm.
  - Product category dropdown.
  - Stock adjustment list.
  - Production recipe create page.
  - Combo checkout.
  - Address manual fallback.

### Done
- `npm run test:automation` runs Selenium headless by default.
- Headed mode supported by env/flag.
- Failure saves screenshot/log.
- No active Playwright dependency/script remains.

## Verification Gates
- Backend: `./gradlew.bat compileJava compileTestJava test --no-daemon`.
- Frontend: `npm run build` and `npm test`.
- Selenium: `RUN_AUTOMATION=1 npm run test:automation` against real backend + Vite proxy.
- Focused API checks:
  - Production recipes null/blank/text query.
  - Stock adjustment API record renders in UI.
  - Combo quote -> pending -> confirm invoice component stock delta.
  - Address missing Goong key/manual fallback.

## Implementation TODO Summary
- Audit UI behavior/theme/CSS before code changes.
- Implement dashboard 4-card stock/expiry alerts and remove fake pending summary rows.
- Convert product category filter to dropdown and verify responsive layout.
- Fix pending-order create/list visibility and error states for guest/user/admin flows.
- Fix stock adjustment list mapping so API data renders on UI.
- Fix production recipes `lower(bytea)` backend error and add regression coverage.
- Move production recipe create/edit from modal to admin page flow with standard theme.
- Clear cart on logout across storefront/admin auth actions.
- Implement combo purchase flow from storefront through quote/pending/invoice/component stock.
- Fix storefront address autocomplete/manual fallback flow.
- Remove Playwright files/scripts/dependency and add Selenium runner/helpers/specs.
- Run backend, frontend, Selenium and focused manual/API verification gates.