# Phase 3A — SalesQuote Golden Parity Baseline

**Ngày:** 2026-05-09  
**Tham chiếu plan:** `.cursor/plans/be_performance_n+1_fix_de8140c2.plan.md`  
**Tham chiếu evidence trước:** `phase0a_backend_evidence.md`, `phase0c_query_baseline.md`, `phase0_go_no_go.md`, `phase1_performance_report.md`, `phase2b_pending_order_performance_report.md`

---

## 1. Scope

- **Chỉ test + evidence:** thêm baseline/golden assertions cho `SalesQuoteService.quote` (tương đương `POST /api/sales/quote`) trước Phase 3B QuoteContext.
- **Không** refactor `SalesQuoteService`, không QuoteContext, không đổi pricing/promotion/shipping/loyalty production, không DTO/API contract, không migration, không bật Hibernate batch tuning để che N+1.
- **Mục tiêu:** khóa semantics tiền/hàng (buckets, snapshot, reward line, persist payload) để Phase 3B chứng minh parity sau khi chỉ đổi data-access.

---

## 2. Files changed

| File | Mô tả |
|------|--------|
| `NhaDanShop/src/test/java/com/example/nhadanshop/integration/Phase3aSalesQuoteGoldenBaselineIntegrationTest.java` | Class golden mới: 16 scenario + 1 đo `prepareStatementCount` N=20. |
| `docs/performance/evidence/phase3a_sales_quote_golden_baseline.md` | Báo cáo evidence (file này). |

**Production:** không thay đổi.

---

## 3. Scenarios covered

| # | Scenario | Ghi chú |
|---|----------|---------|
| 1 | POS manual discount | `source=pos`, `manualDiscount` > 0, bucket `manualDiscount` trong breakdown. |
| 2 | Storefront rejects manual discount | `IllegalArgumentException` theo behavior hiện tại. |
| 3 | Storefront rejects line discount | `discountPercent` > 0 trên line → reject. |
| 3b | Client `rewardLine=true` | Reject — reward chỉ backend tạo. |
| 4 | `PERCENT_DISCOUNT` | `promotionDiscount`, `effectivePromotion*`, `promotionSnapshot`. |
| 5 | `FIXED_DISCOUNT` | Cap theo merchandise eligible (fixed > subtotal → cap). |
| 6 | `FREE_SHIPPING` | `promotionDiscount=0`, `shippingDiscount>0`, `subtotal` hàng không giảm vì ship; snapshot KM có `shippingDiscountAmount`. |
| 7 | Voucher percent | `voucherSnapshot`, `voucherDiscount`. |
| 8 | Voucher fixed | `voucherDiscount`; `promotionDiscount=0`. |
| 9 | Voucher free shipping | `voucherDiscount=0`, `shippingDiscount` theo cap/fee; không gộp vào `promotionDiscount`; `VoucherSnapshotDto.shippingDiscountAmount`. |
| 10 | Loyalty redeem | Mock `CustomerLoyaltyService.capRedemption`; `loyaltySnapshot`, `loyaltyDiscount`, `loyaltyRedeemedPoints` trong breakdown. |
| 11 | Gift (`BUY_X_GET_Y`) | `rewardLines`: unit/line subtotal = 0; `promotionDiscount` tiền = 0; `giftLines` trong `promotionSnapshot`. |
| 12 | Combo line | Combo `COMBO` + `ProductComboItem`; line mapping, `lineSubtotal` = giá combo, `commercialSnapshot` có. |
| 13 | Exact batch | `batchId` trên response line; `remainingQty` batch không đổi sau quote. |
| 14 | Storefront + shipping address | `shippingQuoteSnapshot` có `fee` (≥0), `source`. |
| 15 | Persisted `SalesQuote.payloadJson` | Deserialize `SalesQuotePayloadDto`: breakdown, lines, promotion, shipping khớp response chính. |
| 16 | Query reference N=20 | Hibernate `prepareStatementCount` (một run local, không claim tối ưu). |

**Bổ sung đã có sẵn repo (không trùng method nhưng cùng gate gift/web):**

- `SalesQuotePromotionFlowIntegrationTest` — `QUANTITY_GIFT` (repeatable/cap/stock guard).
- `Slice6cQuotePaymentIntegrationTest` — storefront voucher, shipping, quote→invoice/pending (commercial flows).

---

## 4. Scenarios not covered (trong class Phase3A) + lý do

| Scenario | Lý do |
|----------|--------|
| `QUANTITY_GIFT` trực tiếp trong `Phase3aSalesQuoteGoldenBaselineIntegrationTest` | Đã có coverage chi tiết trong `SalesQuotePromotionFlowIntegrationTest`; Phase3A chọn `BUY_X_GET_Y` làm đại diện gift line + bucket không discount tiền. |
| Golden JSON file tĩnh dưới `src/test/resources/golden/sales-quote/` | Không bắt buộc: assert field-by-field đủ rõ; tránh drift ID thời gian. |
| Đo query N=20 trong Phase 0C chính thức | Phase 0C hiện tham số `{10,50,100}`; Phase3A ghi nhận riêng N=20 trong test + log `PHASE3A`. |

---

## 5. Golden assertion summary table

| Scenario | Test method | Key fields asserted | Pass/Fail |
|----------|-------------|---------------------|-----------|
| POS manual discount | `golden_pos_manual_discount_separate_bucket` | `quoteId`, `manualDiscount`, `lines`, `subtotal` | Pass |
| Storefront manual reject | `golden_storefront_rejects_manual_discount` | Exception + message | Pass |
| Storefront line discount reject | `golden_storefront_rejects_line_discount` | Exception + message | Pass |
| Client rewardLine reject | `golden_client_reward_line_rejected` | Exception | Pass |
| Percent promotion | `golden_percent_promotion` | `effectivePromotion*`, `promotionSnapshot`, `promotionDiscount`, `subtotal` | Pass |
| Fixed promotion | `golden_fixed_promotion_capped` | `promotionDiscount` capped | Pass |
| Free shipping promotion | `golden_free_shipping_buckets` | `promotionDiscount=0`, `shippingDiscount>0`, `subtotal`, snapshot `discountAmount` / `shippingDiscountAmount` | Pass |
| Voucher percent | `golden_voucher_percent` | `voucherSnapshot`, `voucherDiscount` | Pass |
| Voucher fixed | `golden_voucher_fixed` | `voucherDiscount`, `promotionDiscount=0` | Pass |
| Voucher free shipping | `golden_voucher_free_shipping` | `shippingDiscount`, voucher shipping amount, không promotion merchandise discount | Pass |
| Loyalty redeem | `golden_loyalty_redeem` | `loyaltySnapshot`, `loyaltyDiscount`, `loyaltyRedeemedPoints` | Pass |
| Gift BXGY | `golden_buy_x_get_y_gift_line` | `rewardLines`, price 0, `giftLines`, `promotionDiscount` tiền = 0 | Pass |
| Combo | `golden_combo_line` | `productId`, `lineSubtotal`, `commercialSnapshot`, `subtotal` | Pass |
| Batch line | `golden_exact_batch_line` | `batchId`, batch qty unchanged | Pass |
| Storefront shipping | `golden_storefront_shipping_snapshot` | `shippingQuoteSnapshot.fee`, `source` | Pass |
| Persisted payload | `golden_persisted_payload_snapshot` | `SalesQuotePayloadDto` vs response | Pass |
| Query N=20 | `baseline_quote_n20_prepare_statement_count` | `prepareStatements` > 0 (log) | Pass |

---

## 6. Persisted quote snapshot coverage

- **Có persist:** mọi quote thành công ghi `sales_quotes.payload_json` (`SalesQuotePayloadDto` v1) — đã assert trong `golden_persisted_payload_snapshot`: `pricingBreakdownSnapshot`, `lines`, `promotionSnapshot`, `shippingQuoteSnapshot` (voucher/loyalty null trong scenario đó nếu không áp dụng).
- **Reward lines:** có trong payload `rewardLines` khi promotion tạo quà (đã cover cụm gift ở test khác trong repo; scenario persist dùng percent + manual + ship để kiểm tra JSON chính).

---

## 7. Query baseline reference for quote

- **Công cụ:** `HibernateStatementStatsHelper` + `spring.jpa.properties.hibernate.generate_statistics=true` trong `@DataJpaTest` của Phase3A.
- **Run local (2026-05-09):** `PHASE3A	sales_quote	N_lines=20	prepareStatements=26` (log trong `TEST-...Phase3aSalesQuoteGoldenBaselineIntegrationTest.xml`).
- **So sánh tương đối:** Phase 0C (`phase0c_query_baseline.md`) ~ **N+6** cho storefront đơn giản (N=10 → 16). N=20 → 26 cùng pattern tuyến tính; **không kết luận cải thiện** từ Phase3A.

---

## 8. Business truth guardrails verified (từ tests)

- POST quote là nguồn pricing checkout/POS (baseline khóa payload).
- Storefront: không manual/line discount; không `rewardLine` client.
- Buckets tách: manual / promotion (tiền hàng) / voucher / loyalty / shipping fee & shipping discount.
- `FREE_SHIPPING` KM: `promotionDiscount` tiền hàng = 0; giảm phí ship qua `shippingDiscount` / snapshot shipping KM.
- Gift: dòng reward giá 0; không dùng `promotionDiscount` tiền cho BXGY trong scenario kiểm tra.
- VAT/loyalty chi tiết: có field trong DTO/breakdown; Phase3A không đổi công thức — loyalty qua mock chỉ khóa wiring snapshot + breakdown.
- Combo: không đổi semantics stock trong Phase3A (chỉ quote + assert pricing/snapshot).
- Batch: quote không mutate `remainingQty`.
- Không recompute lịch sử — chỉ quote runtime snapshot.

---

## 9. Tests run

```powershell
cd C:\Work\NhaDanShopBT\NhaDanShop
.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase3aSalesQuoteGoldenBaselineIntegrationTest"
.\gradlew.bat test --tests "com.example.nhadanshop.service.SalesQuotePromotionFlowIntegrationTest"
.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase6BeDomainRegressionIntegrationTest"
.\gradlew.bat test --tests "com.example.nhadanshop.integration.Phase5CommercialPromotionsVouchersMvcIntegrationTest"
.\gradlew.bat test --tests "com.example.nhadanshop.service.Slice6cQuotePaymentIntegrationTest"
```

**Kết quả (2026-05-09):** toàn bộ **PASS**.

---

## 10. Final verdict

**GO_TO_IMPLEMENT_PHASE_3B**

Đủ golden baseline cho các bucket/snapshot chính của SalesQuote; không phát hiện mâu thuẫn business truth cần dừng gate. Phase3B chỉ được phép refactor data-access với parity so với baseline này + tests hiện có.

---

## 11. Kết luận ngắn

| Câu hỏi | Trả lời |
|---------|---------|
| Production code đổi? | **Không** |
| Business semantics đổi? | **Không** |
| Phase3B | **GO** (theo verdict trên) |
