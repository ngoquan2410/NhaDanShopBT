---
name: auth-account-hardening
overview: Sửa luồng đăng ký/đăng nhập/đăng xuất/account, thêm password/reset/TOTP/refresh-token hardening, đồng thời mở rộng audit FE-BE theo backend-integration-pack cho tồn kho, batch, pricing, production, reports và các lỗi UI/API admin/storefront đang thấy.
todos:
  - id: fix-session-nav-logout-routing
    content: Sửa FE session nav, logout, Enter submit, và điều hướng admin/user sau login/signup.
    status: completed
  - id: password-policy
    content: Thêm password strength policy ở FE và enforce ở BE signup/reset/user-create nếu phù hợp.
    status: completed
  - id: reset-password-email
    content: Thêm reset password backend token + SMTP mail + FE forgot/reset pages.
    status: completed
  - id: totp-account-ui
    content: Nối `/account` và `/admin/security` với API TOTP thật thay vì mock.
    status: completed
  - id: refresh-token-15m
    content: Đổi refresh token TTL sang 15 phút và cập nhật config/tests.
    status: completed
  - id: mock-data-audit
    content: Rà mock/local runtime data còn sót và lập/fix danh sách ưu tiên.
    status: completed
  - id: integration-pack-correctness-audit
    content: Đối chiếu HSD, giá nhập/bán, batch, allocation, production, tồn kho, doanh thu/lợi nhuận với docs/backend-integration-pack.md.
    status: completed
  - id: admin-ui-api-gap-audit
    content: "Rà các lỗi admin UI/API: pending view trắng, badge count lệch, lazy paging, filter BE, layout responsive, category missing, production 500, store settings/GHN."
    status: completed
  - id: storefront-checkout-polish
    content: "Rà storefront: carousel speed, promotion applied UI, checkout address autocomplete/Goong config failure handling."
    status: completed
  - id: pending-order-fixes
    content: Fix pending order view trắng, nút xem đơn chưa confirm, badge count lệch, và thêm/làm rõ lazy pagination server-side.
    status: completed
  - id: admin-filter-responsive-fixes
    content: Fix filter BE cho hóa đơn/sản phẩm/các admin pages, category missing, layout filter responsive trên mobile/tablet/iPad/desktop.
    status: completed
  - id: production-api-ui-fixes
    content: Fix production recipes API lower(bytea), production modal theme, UX chọn/tạo thành phẩm, production pricing/pending/invoice correctness.
    status: completed
  - id: store-ghn-goong-fixes
    content: Fix Goong autocomplete thiếu key fallback, Store Settings PUT 403, GHN logs gọi BE thay vì Supabase.
    status: completed
  - id: dashboard-storefront-polish
    content: Fix dashboard expiry block, storefront carousel speed, promotion applied UI không lộ data E2E/test.
    status: completed
  - id: test-gates-regression
    content: Chạy focused integration/regression cho từng fix; nếu tác động lớn thì chạy full backend test, FE build/unit, và full Playwright E2E.
    status: completed
isProject: false
---

# Auth Account Hardening Plan

## Mục Tiêu
- Sau đăng ký/đăng nhập, UI phải phản ánh đúng session: không còn nút `Đăng nhập` khi đã login, account nav đúng, admin đi về `/admin`.
- Logout phải hoạt động ổn định để đăng nhập lại account khác.
- Thêm ràng buộc password mạnh, reset password qua email SMTP bắt buộc, và màn hình bật/tắt TOTP cho người dùng.
- Đổi refresh token TTL từ ngày sang 15 phút.
- Rà và phân loại mock/local data còn tồn tại trong FE.
- Mở rộng audit theo [`docs/backend-integration-pack.md`](docs/backend-integration-pack.md): batch là stock truth, barcode `BATCH:{batchId}`, allocation/VAT/report dùng đúng snapshot và line net revenue.
- Rà các lỗi UI/API trong admin/storefront từ ảnh hiện tại: pending order, invoice/product/category filters, responsive layout, production API/modal, Goong/GHN/store settings.

## Luồng Auth Hiện Tại Và Nguyên Nhân
- [`nha-dan-pos-c091ee5b/src/components/layout/StorefrontNav.tsx`](nha-dan-pos-c091ee5b/src/components/layout/StorefrontNav.tsx): nav đang hard-code link `Đăng nhập`, không đọc `useAuth()`, nên sau signup thành công vẫn hiện nút login.
- [`nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx`](nha-dan-pos-c091ee5b/src/lib/admin-auth.tsx): `signOut()` xóa local session trước rồi gọi `/api/auth/logout` không kèm `Authorization`, trong khi backend mặc định yêu cầu authenticated cho `/api/auth/logout`, gây `403`.
- [`nha-dan-pos-c091ee5b/src/pages/storefront/Login.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Login.tsx): không có `<form onSubmit>`, nên Enter không login.
- [`nha-dan-pos-c091ee5b/src/pages/storefront/Signup.tsx`](nha-dan-pos-c091ee5b/src/pages/storefront/Signup.tsx): có UI giả cho TOTP step 2/3 nhưng `submit()` thực tế auto-login và navigate `/account`; password chỉ kiểm tra `>= 6` ở FE.
- [`NhaDanShop/src/main/java/com/example/nhadanshop/dto/SignUpRequest.java`](NhaDanShop/src/main/java/com/example/nhadanshop/dto/SignUpRequest.java): backend hiện chỉ yêu cầu password 6-100 ký tự.
- [`NhaDanShop/src/main/java/com/example/nhadanshop/service/AuthService.java`](NhaDanShop/src/main/java/com/example/nhadanshop/service/AuthService.java): refresh token đang `plusDays(jwtTokenProvider.getRefreshTokenExpiryDays())`.
- [`NhaDanShop/src/main/java/com/example/nhadanshop/controller/AuthController.java`](NhaDanShop/src/main/java/com/example/nhadanshop/controller/AuthController.java): đã có API TOTP setup/enable/disable, nhưng FE user account chưa dùng; admin security page hiện mock.

## Thiết Kế Sẽ Áp Dụng
- Session UI:
  - `StorefrontNav` dùng `useAuth()` để hiển thị `Tài khoản` / tên user / `Đăng xuất` khi đã login, `Đăng nhập` khi chưa login.
  - Admin có link rõ về `/admin` nếu role có `ROLE_ADMIN`.
- Điều hướng sau login:
  - Giữ rule đúng: admin login mặc định vào `/admin`, user vào `/account`.
  - Nếu login có `next`, chỉ cho admin vào `/admin/**`; user bị đưa về `/account`.
- Logout:
  - FE gọi logout với `Authorization: Bearer accessToken` và `refreshToken`, sau đó mới clear local session; nếu API lỗi vẫn clear local session để user không kẹt.
  - BE permit `/api/auth/logout` cho token hợp lệ hoặc cho anonymous request có refresh token nếu muốn logout idempotent. Ưu tiên idempotent: logout không nên block UX.
- Password mạnh:
  - Policy đề xuất: tối thiểu 10 ký tự, có chữ thường, chữ hoa, số, ký tự đặc biệt, không chứa username, confirm phải khớp.
  - FE hiển thị checklist; BE enforce bằng validator/service để không bypass được.
- Reset password qua email SMTP bắt buộc:
  - Thêm endpoints public: `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`.
  - Thêm bảng reset token hash, expiry, usedAt.
  - Dùng Spring Mail SMTP required config; thiếu SMTP thì endpoint trả lỗi rõ ràng.
  - Email chứa link FE `/reset-password?token=...`.
- TOTP user:
  - Thêm block bảo mật trong `/account`: trạng thái TOTP, setup QR/secret, nhập OTP để enable, nhập OTP để disable.
  - Admin `/admin/security` chuyển từ mock sang API thật cho current admin; session list mock sẽ được ghi rõ hoặc bỏ nếu chưa có backend sessions API.
- Refresh token 15 phút:
  - Đổi config từ `refresh-token-expiry-days` sang phút hoặc duration, ví dụ `jwt.refresh-token-expiry-minutes=15`.
  - Cập nhật entity issuance trong `AuthService` dùng `LocalDateTime.now().plusMinutes(...)`.
  - Cập nhật tests liên quan token rotation/logout.
- Mock data audit:
  - Tạo danh sách còn runtime mock/local adapter: invoices/admin legacy types, combos, suppliers/customers typing from `mock-data`, `AdminSecurity` sessions, local voucher/promotion adapters, LocalInvoiceAdapter conditional, POS scan demo.
  - Phân loại: `runtime mock cần thay BE`, `type-only import không ảnh hưởng`, `dev/test-only giữ được`.

## Bổ Sung: Audit Correctness Theo Backend Integration Pack
- Product / Variant / Batch:
  - Kiểm tra Hạn Sử Dụng, Giá Nhập, Giá Bán trong `ProductVariant` và `ProductBatch` có map đúng giữa backend DTO, admin UI, storefront, POS, receipt label.
  - Xác nhận `ProductBatch.remainingQty` là stock truth, `ProductVariant.stockQty` chỉ là projection và luôn sync sau receipt, invoice, cancel, stock adjustment, production.
- Pricing / PendingOrder / Invoice:
  - Audit quote -> pending order -> invoice không recompute snapshot sai.
  - Kiểm VAT, khuyến mãi, voucher, free shipping, phí ship, loyalty/royalty point redemption và reward lines có allocate đúng vào paid merchandise lines.
  - Kiểm line truth theo pack: `lineGrossAmount`, `lineOwnDiscountAmount`, `lineNetRevenue`, `unitCostSnapshot`, COGS, profit.
  - VAT loại khỏi revenue/profit; shipping không phân bổ vào product/category revenue/profit.
- POS / Barcode / Batch:
  - POS scan variant vs `BATCH:{batchId}`: exact-batch invoice phải trừ đúng batch, không FEFO khi có `batchId`.
  - Receipt label barcode phải encode `BATCH:{batchId}` và hiển thị đủ thông tin cần scan: human batch code, product, variant, HSD, giá/đơn vị nếu UI cần.
  - Production output label cũng encode `BATCH:{outputBatchId}`.
- Stock Adjustment / Inventory:
  - Kiểm stock adjustment âm unsourced theo `currentAdjustable`, explicit source theo batch trace, reverse exact inverse, không đoán FEFO.
  - Kiểm kiểm kê/điều chỉnh có trừ đúng batch khi có nguồn batch, và report inventory cộng/trừ adjustment đúng.
- Production:
  - Kiểm giá bán, pending order, invoice khi bán hàng thành phẩm từ sản xuất: output batch cost = weighted consumed raw cost + overhead / outputQty; expiry = min raw expiry.
  - Kiểm raw material `isSellable=false` vẫn dùng được cho production input; output `outputMustBeSellable` chỉ validate, không tự mutate variant.
- Reports:
  - Kiểm báo cáo tồn kho opening/received/sold/adjusted/production/closing reconciled với batch sum và variant projection.
  - Kiểm doanh thu/lợi nhuận product/category dùng persisted line net revenue/COGS, loại VAT/ship đúng.

## Bổ Sung: Admin UI/API Gaps Từ Quan Sát Hiện Tại
- Pending orders:
  - Nút `Xem` với đơn chưa confirm đang làm trang trắng hoặc không mở detail; cần debug route/drawer state/error boundary.
  - Badge count của `Đơn chờ thanh toán` ở sidebar/topbar không khớp với item thực tế; cần thống nhất query count theo status nào.
  - List pending orders phải có server pagination/lazy loading, không load toàn bộ khi data lớn.
- Admin filters:
  - Kiểm toàn bộ filter của admin pages đã gắn BE API chưa. Trước mắt `Hóa đơn` filter chưa rõ có gửi query BE đúng không.
  - Product filter đang vỡ layout; audit responsive layout cho toàn admin trên mobile, tablet, iPad, desktop và không cho filter bar overflow làm hỏng UI.
  - `Danh mục` không hiển thị dù DB có nhiều category; kiểm adapter/query/permission/mapping/filter active.
- Production:
  - Sửa API `GET /api/production-recipes?page=0&size=100&sort=id,desc` lỗi `lower(bytea) does not exist`; khả năng query `LIKE lower(...)` đang nhận param typed bytea/null không cast text.
  - Modal tạo quy trình không đồng nhất theme; chuyển sang component/style chuẩn của `nha-dan-pos-c091ee5b`.
  - Xem lại UX sản xuất: hiện chọn Sản phẩm thành phẩm có sẵn. Cần quyết định liệu production recipe nên chọn finished variant có sẵn hay hỗ trợ tạo sản phẩm thành phẩm mới ngay trong flow. Default plan: giữ backend contract chọn variant có sẵn, thêm CTA/link tạo sản phẩm nếu thiếu để tránh production tự tạo catalog ngầm.
- Store settings / GHN:
  - `PUT /api/store/payment-settings` đang 403: kiểm request có gửi JWT admin qua `adminFetchJson` chưa, refresh 403 flow, và SecurityConfig.
  - Nhật kí GHN đang gọi Supabase trực tiếp; phải chuyển sang BE-owned API hoặc đánh dấu là mock/runtime gap và loại khỏi production path.
- Dashboard:
  - Phần “sản phẩm sắp hết hạn” nằm dưới “sản phẩm hết hạn” đang rối; plan UI: bỏ block sắp hết hạn nếu trùng nghĩa hoặc gộp thành một card cảnh báo hợp lý.

## Bổ Sung: Storefront / Checkout / Promotion
- Storefront carousel:
  - Tăng tốc chuyển slide “Top 5 sản phẩm chủ đạo”, đảm bảo không gây layout shift.
- Promotion UI:
  - Mục “Khuyến mãi áp dụng được” đang hiển thị nhiều record E2E. Cần xác định vì data test đang trong DB hay UI đang show raw admin promotion names; nếu là data E2E thì thêm cleanup/prefix filter hoặc hiển thị phù hợp với user.
- Checkout address:
  - `/api/address-autocomplete` lỗi 500 khi `GOONG_REST_API_KEY not configured`; UI phải xử lý cấu hình thiếu như fallback manual, backend nên trả 503/controlled response không làm user hiểu là lỗi hệ thống.
  - Address autocomplete và manual dropdown phải dùng BE dataset ổn định, không block checkout khi Goong thiếu config nhưng fallback zone quote vẫn đủ.

## Kiểm Thử
- Quy tắc bắt buộc:
  - Mỗi bug fix phải có ít nhất một focused test hoặc focused manual/API verification tương ứng.
  - Nếu fix đụng domain shared như auth, invoice, stock, production, report, pricing allocation, hoặc security config thì chạy integration/regression tests liên quan.
  - Nếu fix đụng nhiều domain hoặc contract FE-BE chung thì chạy full gates: backend test, FE typecheck/build/unit, và full Playwright E2E.
  - Không được “nới test để pass”; nếu test phát hiện bug mới thì ghi lại và xử lý/triage trước khi báo xanh.
- Backend focused tests:
  - Auth signup/login/logout/refresh 15 phút.
  - Strong password reject/accept.
  - Forgot/reset password token lifecycle, SMTP failure behavior.
  - TOTP setup/enable/login verify/disable.
  - Production recipes list query với `q` null/blank/text không lỗi `lower(bytea)`.
  - Store settings PUT yêu cầu admin JWT và pass với session hợp lệ.
  - Inventory/report reconciliation cho receipt, POS exact batch, stock adjustment, production, invoice cancel.
  - Pricing allocation regression cho VAT, promo, voucher, shipping, loyalty, pending confirm snapshot, invoice line COGS/profit.
- Frontend tests:
  - Signup auto-login updates nav and account page.
  - Login submit by Enter.
  - Logout then login as another user clears previous account state.
  - Admin login default redirects `/admin`.
  - Account TOTP enable/disable UI calls real backend.
  - Pending order view chưa confirm không blank page; badge count khớp list query.
  - Admin filters gửi đúng query BE; category page hiển thị data DB.
  - Responsive smoke cho admin filter bars trên mobile/tablet/iPad widths.
  - Store settings save gửi Authorization và không bị 403 khi session admin hợp lệ.
  - GHN logs UI không gọi Supabase direct trong production path.
- E2E smoke:
  - Register user, nav no longer shows `Đăng nhập`, account shows correct user.
  - Logout returns to guest nav and next login shows new user.
  - POS scan `BATCH:{batchId}` trừ đúng batch; label receipt scan được ở POS.
  - Quote -> pending -> invoice correctness matrix cho VAT/promo/voucher/ship/loyalty allocation.
  - Production output batch bán ra có COGS/profit đúng.
  - GHN logs không gọi Supabase trực tiếp trong production UI path.

## Checklist Issue-by-Issue Từ Chat
- Auth/account:
  - Sau đăng ký thành công nav không còn hiện nút `Đăng nhập`.
  - Password mạnh ở FE và BE.
  - Quên mật khẩu gửi email reset qua SMTP bắt buộc.
  - Logout không 403/kẹt session; login account khác không còn dùng session cũ.
  - Admin login mặc định vào `/admin`, user vào `/account`.
  - Login submit bằng Enter.
  - User có chỗ bật/tắt TOTP trong account.
  - Refresh token TTL 15 phút.
- Integration pack correctness:
  - HSD, giá nhập, giá bán trong product/variant/batch đúng.
  - Invoice/pending/quote tính VAT, promo, voucher, shipping, loyalty/reward và allocation đúng.
  - POS scan barcode trừ đúng batch.
  - Barcode phiếu nhập đủ thông tin và encode `BATCH:{batchId}`.
  - Kiểm kê/điều chỉnh trừ/đảo đúng batch/trace.
  - Production price/cost/pending/invoice đúng.
  - Báo cáo tồn kho, doanh thu, lợi nhuận đúng.
- Admin/storefront bugs:
  - Pending order `Xem` chưa confirm không làm trắng trang.
  - Count thông báo pending order khớp item/list.
  - Pending order list có lazy/server pagination để tránh chậm khi nhiều data.
  - Tất cả filter admin gắn BE API, gồm Hóa đơn.
  - Product filter và mọi filter/layout không vỡ trên mobile/tablet/iPad/desktop.
  - Category page hiển thị đúng category từ DB.
  - Storefront carousel chạy nhanh hơn.
  - Dashboard bỏ/gộp block “sản phẩm sắp hết hạn” bên dưới “sản phẩm hết hạn”.
  - Production recipes API không còn 500 `lower(bytea)`.
  - Production modal dùng theme chuẩn; UX thành phẩm được quyết định rõ.
  - Promotion applied UI không lộ data E2E/test khó hiểu.
  - Checkout address autocomplete thiếu Goong key fallback đúng, không 500 làm hỏng UX.
  - Store settings update không 403 khi admin hợp lệ.
  - GHN logs lấy từ BE, không gọi Supabase trực tiếp.

## Rủi Ro Và Lưu Ý
- Reset password SMTP bắt buộc cần cấu hình env thật trước khi deploy; nếu local chưa có SMTP, test nên dùng test profile/mail mock ở backend test, không nới runtime behavior.
- Refresh token 15 phút sẽ làm người dùng bị đăng xuất nhanh hơn; FE cần xử lý lỗi refresh rõ ràng và đưa về `/login`.
- TOTP enable revoke all refresh tokens hiện có trong backend; FE sau enable nên thông báo và yêu cầu login lại hoặc refresh session theo contract mới.
- Rất nhiều record `E2E-*`, `SMOKE*`, `FC-*` đang tồn tại trong DB local nên có thể làm UI nhìn sai. Plan sẽ phân biệt bug logic với dữ liệu test bẩn trước khi sửa UI.
- Một số yêu cầu là product decision, đặc biệt production modal có nên tạo sản phẩm thành phẩm mới inline hay chỉ chọn variant có sẵn. Default an toàn là giữ contract chọn variant có sẵn và thêm điều hướng tạo sản phẩm.