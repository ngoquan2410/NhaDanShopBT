# Service layer

Frontend-first architecture. The folder layout is:

```
src/services/
  index.ts                          ← composition root (singletons)
  types.ts                          ← canonical shared types only
  README.md
  storeSettings/StoreSettingsService.ts     ← interface
  vietQr/VietQrService.ts                   ← interface
  addresses/AddressService.ts               ← interface
  shipping/ShippingService.ts               ← interface
  pendingOrders/PendingOrderService.ts      ← interface
  promotions/PromotionEvaluationService.ts  ← interface
  customers/CustomerService.ts              ← interface
  adapters/local/                   ← localStorage-backed implementations
    Local*.ts
    storage.ts                      ← internal helper, NOT for UI
    data/vn-address.json            ← bundled VN dataset, NOT for UI
  adapters/remote/                  ← public HTTP API-backed implementations
    RemoteAddressAdapter.ts         ← provinces.open-api.vn (cached 7d)
    HybridAddressAdapter.ts         ← remote-first, local fallback
  utils/
    money.ts ids.ts date.ts         ← service-layer helpers only
```

## Hard rules

1. UI components import only from `@/services` and `@/services/types`.
2. `localStorage` access is allowed **only** inside `src/services/adapters/local/**`.
3. UI components must **not** import `vn-address.json` (or any adapter data) directly.
4. No Lovable Cloud. No hardcoded production bank info in UI or in constants.
5. Temporary persistence stays behind local adapters.
6. Future EC2 backend integration must replace adapter implementations only — UI screens and service interfaces are unchanged.

## Adapter swap

To move to a real backend, add `src/services/adapters/api/*` implementing the same
interfaces and rebind them in `src/services/index.ts`. No UI changes required.
