# Mock / local runtime data audit (FE)

**Purpose:** Track UI paths that still use placeholder or demo data vs production backend.

| Area | Location | Type | Priority |
|------|----------|------|----------|
| Admin session list | `src/pages/admin/Security.tsx` | Labeled demo until BE exposes session API | Low |
| Goong test page | `src/pages/admin/GoongTestPage.tsx` | Dev-only harness | Dev-only |
| POS / scan demos | Search `dryRun`, `demo` in `src/pages/admin/POS.tsx` | Verify before release | Medium |
| Local adapters | `LocalInvoiceAdapter`, `mock-data` imports | Type-only vs runtime — grep when touching invoices | Medium |
| Promotion storefront display | Filter E2E prefixes in DB or UI if raw names leak | Data hygiene | Low |

**Rule:** New features must call backend-owned APIs; direct Supabase from production UI paths is forbidden (GHN logs fixed to `GET /api/admin/ghn-quote-logs`).
