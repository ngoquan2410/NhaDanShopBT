---
name: sellable-stock-guard
overview: Replace quote and pending-order paid+gift stock guards with sellable-batch availability, preserving the final FEFO invoice lock/deduct path.
todos:
  - id: repo-sellable-sum
    content: Reuse existing single-variant sellable-batch sum query; add only if missing.
    status: completed
  - id: quote-guard
    content: Replace SalesQuoteService paid+gift guard availability with sellable-batch sum.
    status: completed
  - id: pending-guard
    content: Replace PendingOrderService paid+gift guard availability with sellable-batch sum.
    status: completed
  - id: guard-tests
    content: Add focused quote and pending-order regression tests for sellable vs physical stock.
    status: completed
  - id: validate
    content: Run compile and targeted backend tests.
    status: completed
isProject: false
---

# Guard Paid + Gift Theo Tồn Bán Được

## Scope

Implement a small backend-only guard update in:

- [NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/SalesQuoteService.java)
- [NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java](NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java)
- [NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java](NhaDanShop/src/main/java/com/example/nhadanshop/repository/ProductBatchRepository.java)

Current guard shape to replace:

```java
ProductVariant variant = variantRepo.findById(entry.getKey()).orElseThrow();
int stockQty = variant.getStockQty() != null ? variant.getStockQty() : 0;
if (stockQty < entry.getValue()) {
```

## Implementation

- Reuse existing `sumSellableRemainingQtyByVariantId(variantId, asOf)` in `ProductBatchRepository`.
- Only add a new repository method/query if source check shows this method is actually missing.
- Do not create duplicate sellable-stock query methods.
- For `asOf`, use `LocalDate.now(businessClock)` (not raw `LocalDate.now()`):
  - Use existing `businessClock` in `SalesQuoteService` and `PendingOrderService` if already present.
  - If a service lacks it, inject `Clock businessClock` consistently with the codebase pattern.
- In `SalesQuoteService.assertVariantDemandAvailable(...)`:
  - Keep merged `billable + reward` demand by `variantId`.
  - Load variant only for code/name in message.
  - Compare demand to `batchRepo.sumSellableRemainingQtyByVariantId(variantId, LocalDate.now(businessClock))`.
  - Throw: `Không đủ tồn bán được cho đơn hàng và quà tặng [CODE]. Cần X, còn Y.`
- In `PendingOrderService.assertPendingVariantDemandAvailable(...)`:
  - Keep aggregation across all `PendingOrderItem`, including reward lines.
  - Use `productBatchRepository.sumSellableRemainingQtyByVariantId(variantId, LocalDate.now(businessClock))`.
  - Use the same error message.
- Do not change FEFO deduct/lock, stock sync, production, stock adjustment, or inventory reporting.

## Tests

Add focused integration coverage to the existing quote/payment or commercial flow tests:

- Quote fails when physical stock is 10 but sellable stock is 5 and paid+gift demand is 6.
- Quote passes when sellable stock is 6 for paid+gift demand 6.
- Pending order creation fails for paid+gift demand 6 with sellable stock 5.
- Different-variant gift aggregates independently and passes when each variant has enough sellable stock.
- Expired-only stock is treated as available 0.

## Validation

Run targeted compile/tests first:

- `./gradlew compileJava compileTestJava`
- Targeted integration tests covering the new cases

Then, if time allows, run the existing quote/payment/commercial suite to confirm invoice FEFO behavior remains unchanged.