---
name: backend third-party migration
overview: Move remaining address, shipping, payment-settings, VietQR, Casso, and Lovable-cloud checkout dependencies behind `NhaDanShop` while preserving the frontend contracts in `nha-dan-pos-c091ee5b` and keeping Slice 1A intact.
todos:
  - id: backend-address-apis
    content: Add backend-owned address list and Goong autocomplete/detail endpoints matching FE address contracts.
    status: pending
  - id: backend-shipping-api
    content: Add backend-owned shipping quote endpoint with GHN integration and backend fallback ownership.
    status: pending
  - id: backend-payment-settings-vietqr
    content: Add backend-owned store payment settings and VietQR generate endpoints, then rewire FE services.
    status: pending
  - id: backend-payment-events-casso
    content: Add backend-owned payment-event APIs and Casso webhook ingestion, then remove FE Supabase dependency from payment reconciliation flows.
    status: pending
  - id: pending-order-fe-decoupling
    content: Remove remaining Supabase-based pending-order list/realtime/update paths so FE checkout/payment flows use backend APIs only.
    status: pending
isProject: false
---

# Backend Third-Party Migration

## Goal
Make the frontend call only backend APIs for checkout, address, shipping, payment-settings, VietQR, and payment-event flows, while preserving accepted Slice 1A behavior and the existing service-layer contracts.

## Key Findings
- The frontend composition root already isolates these seams in [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/index.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/index.ts): `addresses`, `shipping`, `vietQr`, `storeSettings`, `pendingOrders`, and `paymentEvents`.
- Slice 1A backend ownership exists in [C:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/controller/PendingOrderController.java](C:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/controller/PendingOrderController.java) and [C:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java](C:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/service/PendingOrderService.java).
- The remaining third-party and cloud ownership still lives in FE adapters/pages: Province Open API, Goong via Supabase Edge, GHN via Supabase Edge, VietQR via `img.vietqr.io`, payment settings in localStorage, and Casso/payment-events via Supabase DB + Realtime.
- Contract endpoints for addresses, shipping, store payment settings, VietQR, payment events, and Casso webhook are still missing from the backend.

## Migration Approach
1. Add backend-owned address APIs and Goong-backed autocomplete/detail APIs that preserve the FE `AddressService` contract.
2. Add backend-owned shipping quote API and move GHN integration plus fallback decisions behind the backend.
3. Add backend-owned payment settings and VietQR generate APIs; rewire FE `storeSettings` and `vietQr` services without changing screens.
4. Add backend-owned payment-event APIs and `POST /api/webhooks/casso`; remove FE reads/writes and Realtime dependence from pending-payment/admin reconciliation paths.
5. Finish pending-order FE decoupling by removing remaining Supabase-based list/update/remove/realtime assumptions in `CloudPendingOrderAdapter` and affected pages.

## Critical Files
- FE composition and adapters:
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/index.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/index.ts)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/components/shared/AddressAutocomplete.tsx](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/components/shared/AddressAutocomplete.tsx)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/remote/RemoteAddressAdapter.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/remote/RemoteAddressAdapter.ts)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/remote/GhnShippingAdapter.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/remote/GhnShippingAdapter.ts)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/local/LocalStoreSettingsAdapter.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/local/LocalStoreSettingsAdapter.ts)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/local/LocalVietQrAdapter.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/local/LocalVietQrAdapter.ts)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPaymentEventAdapter.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPaymentEventAdapter.ts)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPendingOrderAdapter.ts](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/services/adapters/cloud/CloudPendingOrderAdapter.ts)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Checkout.tsx](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/Checkout.tsx)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/PendingPayment.tsx](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/storefront/PendingPayment.tsx)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/StoreSettings.tsx](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/StoreSettings.tsx)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/UnmatchedPayments.tsx](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/UnmatchedPayments.tsx)
  - [C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/PendingOrders.tsx](C:/Work/NhaDanShopBT/nha-dan-pos-c091ee5b/src/pages/admin/PendingOrders.tsx)
- Backend baseline:
  - [C:/Work/NhaDanShopBT/docs/backend-integration-pack.md](C:/Work/NhaDanShopBT/docs/backend-integration-pack.md)
  - [C:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/security/SecurityConfig.java](C:/Work/NhaDanShopBT/NhaDanShop/src/main/java/com/example/nhadanshop/security/SecurityConfig.java)

## Notes
- Keep Slice 1A endpoints and semantics unchanged.
- Prefer replacing adapter implementations and direct `supabase` page usage over any screen redesign.
- Preserve FE response shapes; if backend internals differ, normalize in the FE adapter layer rather than weakening the backend contract.