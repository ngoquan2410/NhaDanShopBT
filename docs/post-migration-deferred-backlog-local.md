# Post-Migration Deferred Backlog

Local-only tracking note. Not yet pushed.

## Local-Only Constraints

- no push
- no merge into deploy-triggering branch
- no deployment-facing changes without explicit release approval

## Active Follow-Up List

1. GoongTestPage route policy
- Review actual route ownership
- Decide one of:
  - admin-only
  - dev-only / hidden route
  - remove route exposure
- Do not leave it as an accidental public diagnostic page

2. ShippingSettings.tsx non-authoritative warning
- If/when this screen is present in the workspace, add explicit helper text:
  local/transitional only, not the live backend-owned quote source

3. GhnQuoteLogs.tsx non-authoritative warning
- If/when this screen is present in the workspace, add explicit helper text:
  not the authoritative source for the current live backend-owned shipping path

4. Public payment-settings DTO split
- Review current public GET /api/store/payment-settings
- Consider future split:
  - admin/full payment settings DTO
  - public payment-display DTO with only fields needed by checkout/pending-payment

5. VietQR preview hardening follow-up
- Consider moving preview override behavior to an explicitly admin-only preview contract/path
- Keep public generate path limited to persisted backend-owned settings

6. GHN production hardening
- finalize:
  - ghn.token handling
  - ghn.shop-id handling
  - timeout config
  - province/district/ward mapping robustness
- coordinate with deployment / secret management

7. Goong production hardening
- current cache/quota handling is process-local only
- review durable/shared strategy if multi-instance deployment becomes relevant

8. CloudPendingOrderAdapter naming cleanup
- current name is legacy/misleading
- consider future low-risk rename:
  - BackendPendingOrderAdapter
  - or PendingOrderAdapter

9. PendingOrderService.remove(...) cleanup
- currently explicit unsupported compatibility stub
- later consider formal deprecation and eventual interface cleanup

10. Polling vs realtime follow-up
- current admin reconciliation behavior is near-real-time via polling
- decide later whether this remains acceptable or needs a more durable push model
