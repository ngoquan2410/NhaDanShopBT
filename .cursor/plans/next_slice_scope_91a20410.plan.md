---
name: next_slice_scope
overview: Summarize the accepted migration baseline and define the exact next slice before any implementation. The next slice is limited to finishing pending-order frontend decoupling from Supabase/cloud runtime paths while preserving existing business semantics and service contracts.
todos:
  - id: audit-runtime-callers
    content: Confirm which pending-order service methods are actually used in runtime screens and which are compatibility-only.
    status: pending
  - id: remove-prod-supabase-pending-order
    content: Finish pending-order production decoupling by eliminating remaining Supabase-backed runtime paths from the frontend adapter while preserving service contracts.
    status: pending
  - id: verify-no-semantic-drift
    content: Verify that statuses, snapshot handling, payment-proof behavior, and confirm-to-invoice authority remain unchanged after the slice.
    status: pending
isProject: false
---

# Next Slice Baseline

## Already Completed

The accepted baseline already moves these ownership areas to the backend and they should be treated as done unless a hard blocker appears:

- Address ownership is backend-first via `[nha-dan-pos-c091ee5b/src/services/adapters/remote/RemoteAddressAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\remote\RemoteAddressAdapter.ts)` and `[nha-dan-pos-c091ee5b/src/services/addresses/addressAutocompleteApi.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\addresses\addressAutocompleteApi.ts)` against `/api/addresses/*`, `/api/address-autocomplete`, and `/api/address-place-detail`.
- Shipping quote ownership is backend-first via `[nha-dan-pos-c091ee5b/src/services/adapters/remote/GhnShippingAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\remote\GhnShippingAdapter.ts)` against `POST /api/shipping/quote`.
- Payment settings and VietQR are backend-owned via `[nha-dan-pos-c091ee5b/src/services/storeSettings/paymentSettingsApi.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\storeSettings\paymentSettingsApi.ts)` and `[nha-dan-pos-c091ee5b/src/services/vietQr/vietQrApi.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\vietQr\vietQrApi.ts)`.
- Payment-event persistence, webhook ingestion, reconciliation worklists, and manual link flow are backend-owned via `[NhaDanShop/src/main/java/com/example/nhadanshop/controller/PaymentEventController.java](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\controller\PaymentEventController.java)` and `[NhaDanShop/src/main/java/com/example/nhadanshop/controller/CassoWebhookController.java](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\controller\CassoWebhookController.java)`.
- Slice 1A semantics for pending orders already exist in backend command endpoints via `[NhaDanShop/src/main/java/com/example/nhadanshop/controller/PendingOrderController.java](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\controller\PendingOrderController.java)` and `[NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\service\PendingOrderService.java)`.

## Must Remain Unchanged

The next slice must preserve these accepted rules:

- `PendingOrder` remains the canonical pre-invoice record for online checkout, as also documented in `[docs/backend-integration-pack.md](c:\Work\NhaDanShopBT\docs\backend-integration-pack.md)`.
- Online payment creates a pending order first; invoice creation from pending order confirm remains the authoritative completion point.
- Payment proof and payment-event linking must not bypass confirm or create invoices implicitly.
- Pricing, promotion, voucher, shipping, and VAT snapshots remain the commercial source of truth.
- FE business statuses remain exactly: `pending_payment`, `waiting_confirm`, `confirmed`, `paid_auto`, `cancelled`.
- No UI redesign for Checkout, PendingPayment, PendingOrders, or reconciliation. FE normalization should stay in thin adapters.
- Do not reopen completed TODO 1-4 and do not change Slice 1A semantics without a real blocker.

## Transitional Items Still Present

The current transitional state is concentrated in a few places:

- `[nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPendingOrderAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\cloud\CloudPendingOrderAdapter.ts)` still imports Supabase and uses it for:
  - generic `update(...)` fallback
  - `remove(...)`
  - test-only `list(...)`
- The same adapter already routes production `create`, `get`, `getByCode`, `changePaymentMethod`, `markWaitingConfirm`, `confirm`, and `cancel` to backend endpoints, so the remaining cloud dependency is narrow and localized.
- `[nha-dan-pos-c091ee5b/src/services/adapters/remote/GhnShippingAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\remote\GhnShippingAdapter.ts)` still has transitional local admin-config behavior, but that is out of scope for the next slice.
- `[nha-dan-pos-c091ee5b/src/services/auth/adminApi.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\auth\adminApi.ts)` remains a minimal auth bridge and should stay that way for now.
- Polling-based refresh in admin pending-order/reconciliation views is the accepted replacement for realtime and should remain unchanged.

## Exact Scope Of The Next Slice

The next slice should be **pending-order FE decoupling only**.

In scope:

- Remove remaining production Supabase/cloud ownership from pending-order runtime paths in `[nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPendingOrderAdapter.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\adapters\cloud\CloudPendingOrderAdapter.ts)`.
- Preserve the existing `PendingOrderService` FE contract in `[nha-dan-pos-c091ee5b/src/services/pendingOrders/PendingOrderService.ts](c:\Work\NhaDanShopBT\nha-dan-pos-c091ee5b\src\services\pendingOrders\PendingOrderService.ts)` wherever possible.
- Keep production mutations command-shaped and aligned to backend authority already exposed by `[NhaDanShop/src/main/java/com/example/nhadanshop/controller/PendingOrderController.java](c:\Work\NhaDanShopBT\NhaDanShop\src\main\java\com\example\nhadanshop\controller\PendingOrderController.java)`:
  - create
  - get/getByCode
  - list
  - mark waiting confirm
  - change payment method
  - confirm
  - cancel
- Limit any FE adapter normalization to compatibility mapping only; do not redesign admin/storefront screens.
- Audit current runtime callers before adding any new backend endpoint. At the moment, actual UI usage appears concentrated on `list`, `confirm`, `cancel`, `markWaitingConfirm`, `changePaymentMethod`, `create`, `get`, and `getByCode`, while `remove` has no evident runtime caller.

Explicitly out of scope:

- Reworking TODO 1-4.
- Changing payment-event semantics or allowing payment-event link to confirm orders.
- Shipping admin-config migration.
- Final auth architecture.
- New payment-session architecture.
- UI/UX redesign.

## Implementation Notes For The Slice

A conservative implementation should prefer:

- adapter-side removal of Supabase runtime dependencies first
- backend reuse of existing pending-order command endpoints
- only adding backend surface if a real runtime caller requires behavior that cannot be expressed through existing commands
- preserving test/local-only behavior separately if needed, without keeping Supabase as production source of truth
