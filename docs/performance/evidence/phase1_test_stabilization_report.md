# Phase 1 — Test stabilization (StockAdjustmentServiceSlice5b)

## Root cause

`StockAdjustmentServiceSlice5bIntegrationTest` là `@DataJpaTest` + `@Import` gồm `ProductComboService`. `ProductComboService` (production) có dependency constructor **`StockedCatalogGuardService`**. Slice test không quét toàn bộ `@SpringBootApplication` nên không tự tạo bean `StockedCatalogGuardService` → `ApplicationContext` fail với `NoSuchBeanDefinitionException`.

Đây là **thiếu wiring trong test slice**, không phải regression từ Phase 1 read-path.

## Fix applied

- Thêm `@MockBean StockedCatalogGuardService` trên class test.
- Các test trong class chỉ kiểm tra luồng điều chỉnh tồn (FEFO `currentAdjustable`, explicit source batch whitelist, tăng tồn khi inactive, allocation trace) — **không** assert policy archive/deactivate catalog của `StockedCatalogGuardService`.
- Mock nhận mặc định Mockito (void methods no-op); `confirm`/`reverse` có gọi `ProductComboService.refreshCombosContaining` nhưng không gọi các method guard trong kịch bản này.

## Files changed

| File | Change |
|------|--------|
| `NhaDanShop/src/test/java/com/example/nhadanshop/service/StockAdjustmentServiceSlice5bIntegrationTest.java` | `@MockBean StockedCatalogGuardService` + import |

## Vì sao chỉ là test setup

- Không sửa `src/main/**`.
- Không nới lỏng guard trên production; chỉ cung cấp stub trong context test để `ProductComboService` khởi tạo được.

## Production code changed?

**Không.**

## API contract changed?

**Không.**

## Business semantics changed?

**Không.**

## Commands run + results

| Command | Result |
|---------|--------|
| `.\gradlew.bat test --tests "com.example.nhadanshop.service.StockAdjustmentServiceSlice5bIntegrationTest"` | **BUILD SUCCESSFUL** — 14 tests PASSED |
| `.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase0cQueryCountBaselineIntegrationTest" --tests "com.example.nhadanshop.integration.Phase6BeDomainRegressionIntegrationTest" --tests "com.example.nhadanshop.integration.Phase5CommercialPromotionsVouchersMvcIntegrationTest" --tests "com.example.nhadanshop.service.SalesQuotePromotionFlowIntegrationTest"` | **BUILD SUCCESSFUL** (sau fix) |

## Remaining failing tests

Không ghi nhận thêm trong phạm vi các lệnh trên.

## Note

Nếu sau này cần **integration test thật sự** cho `StockedCatalogGuardService` + combo archive, nên tách class test riêng với `@Import`/`@SpringBootTest` phù hợp thay vì dùng mock ở slice 5B.
