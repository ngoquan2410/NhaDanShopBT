---
name: Backend Integration Pack
overview: Produce a backend-ready integration specification from the current `nha-dan-pos-c091ee5b` frontend contracts without implementing wiring yet. The pack captures canonical FE data shapes, current adapter boundaries, API/DTO proposals, status rules, and the recommended first backend integration slice.
todos:
  - id: review-pack
    content: Review the chat-only Backend Integration Pack for contract accuracy and slice order.
    status: pending
  - id: approve-doc-write
    content: If approved, write the finalized spec into `docs/backend-integration-pack.md` without changing app code.
    status: pending
  - id: todo-1776930685578-fgydjvwjs
    content: |
      Continue from this handoff. Do not restart frontend discovery.

      Current approved plan:

      * Base the Backend Integration Pack on the current frontend app: `c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b`
      * Preserve the current canonical frontend contracts in:

        * `src/services/types.ts`
        * `src/services/index.ts`
      * Do NOT implement backend wiring yet
      * Do NOT redesign the UI
      * Do NOT write `docs/backend-integration-pack.md` yet

      Confirmed frontend facts:

      * Canonical business contracts already exist for:

        * PendingOrder
        * Invoice
        * GoodsReceipt
        * Batch
        * InventoryMovement
        * ShippingAddress
        * pricing snapshots
        * promotion snapshots
        * voucher snapshots
      * Service composition already marks replacement boundaries:

        * pending orders and payment events use cloud adapters
        * invoices, products, inventory, goods receipts, promotions, vouchers, categories, and payment sessions still use local adapters
      * Checkout, pending payment, admin pending orders, unmatched payments, invoices, goods receipts, products, promotions, vouchers, and reports expose the real screen-level expectations for backend integration

      Most relevant files:

      * `src/services/types.ts`
      * `src/services/index.ts`
      * `src/pages/storefront/Checkout.tsx`
      * `src/pages/storefront/PendingPayment.tsx`
      * `src/pages/admin/PendingOrders.tsx`
      * `src/services/adapters/cloud/CloudPendingOrderAdapter.ts`
      * `src/services/adapters/local/LocalInvoiceAdapter.ts`
      * `src/services/adapters/local/LocalGoodsReceiptAdapter.ts`
      * `src/services/adapters/local/LocalInventoryAdapter.ts`
      * `src/services/adapters/cloud/CloudPaymentEventAdapter.ts`
      * `src/services/adapters/local/LocalPromotionAdapter.ts`
      * `src/services/adapters/local/LocalVoucherAdapter.ts`

      Task:
      Generate the full chat-only Backend Integration Pack now.

      Return exactly these 10 sections:

      1. Business Rule Summary
      2. Frontend Canonical Contract Summary
      3. FE-BE Field Mapping
      4. API Contract by Domain
      5. DTO Proposals
      6. Status Transition Matrix
      7. Source-of-Truth Rules
      8. Vertical Slice Plan
      9. Acceptance Checklist
      10. Risks / Open Questions

      Requirements:

      * be concrete, code-aware, and implementation-oriented
      * use the current frontend contracts as the baseline
      * do not invent a greenfield redesign
      * preserve current FE canonical contracts unless a real mismatch is proven
      * include exact endpoint proposals, DTO field names, status enums, query params, and slice order
      * stop after printing the pack in chat
      * do not write files yet
    status: completed
isProject: false
---

# Backend Integration Pack Plan

## Scope
- Base the integration spec on the current frontend app at [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b).
- Preserve the current FE canonical contracts in [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\types.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\types.ts) and current service boundaries in [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\index.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\index.ts).
- Do not implement backend wiring or rewrite UI yet.

## Confirmed frontend facts
- Canonical business contracts already exist for `PendingOrder`, `Invoice`, `GoodsReceipt`, `Batch`, `InventoryMovement`, `ShippingAddress`, pricing snapshots, promotion snapshots, and voucher snapshots in [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\types.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\types.ts).
- Service composition already marks replacement boundaries: pending orders and payment events use cloud adapters; invoices, products, inventory, goods receipts, promotions, vouchers, categories, and payment sessions still use local adapters in [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\index.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\index.ts).
- Checkout, pending payment, admin pending orders, unmatched payments, invoices, goods receipts, products, promotions, vouchers, and reports expose the real screen-level expectations for backend integration.

## Deliverable
- Return the full integration pack in chat now with the ten requested sections.
- Hold off on writing [docs/backend-integration-pack.md](docs/backend-integration-pack.md) until approved.

## Most relevant files
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\types.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\types.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\index.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\index.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\pages\storefront\Checkout.tsx](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\pages\storefront\Checkout.tsx)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\pages\storefront\PendingPayment.tsx](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\pages\storefront\PendingPayment.tsx)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\pages\admin\PendingOrders.tsx](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\pages\admin\PendingOrders.tsx)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\cloud\CloudPendingOrderAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\cloud\CloudPendingOrderAdapter.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalInvoiceAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalInvoiceAdapter.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalGoodsReceiptAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalGoodsReceiptAdapter.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalInventoryAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalInventoryAdapter.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\cloud\CloudPaymentEventAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\cloud\CloudPaymentEventAdapter.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalPromotionAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalPromotionAdapter.ts)
- [c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalVoucherAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\local\LocalVoucherAdapter.ts)