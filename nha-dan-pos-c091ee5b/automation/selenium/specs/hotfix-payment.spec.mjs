export default {
  name: "Hotfix payment scope: Casso/manual-link/QR/candidates preflight",
  tags: ["hotfix-payment"],
  order: 4,
  async run(_driver, ctx) {
    const skippedTests = [
      "unmatched_link_dialog_excludes_cancelled_confirmed",
      "manual_link_does_not_confirm",
      "casso_webhook_exact_amount_auto_confirms",
      "casso_webhook_overpaid_goes_review",
      "pending_payment_qr_stable_with_polling",
      "qr_regenerate_after_ttl_or_explicit_only",
    ];

    try {
      const res = await ctx.api.fetch("/actuator/health", { timeout: 5000 });
      if (!res.ok) {
        return {
          skipped: true,
          reason: `SKIPPED_WITH_REASON: local backend health returned HTTP ${res.status}; skipped ${skippedTests.join(", ")}`,
        };
      }
    } catch (e) {
      return {
        skipped: true,
        reason: `SKIPPED_WITH_REASON: local backend unavailable (${e?.message || e}); skipped ${skippedTests.join(", ")}`,
      };
    }

    try {
      const res = await fetch(ctx.config.baseUrl, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        return {
          skipped: true,
          reason: `SKIPPED_WITH_REASON: local frontend returned HTTP ${res.status}; skipped ${skippedTests.join(", ")}`,
        };
      }
    } catch (e) {
      return {
        skipped: true,
        reason: `SKIPPED_WITH_REASON: local frontend unavailable (${e?.message || e}); skipped ${skippedTests.join(", ")}`,
      };
    }

    if (!ctx.config.adminUsername || !ctx.config.adminPassword) {
      return {
        skipped: true,
        reason: `SKIPPED_WITH_REASON: ADMIN_USERNAME/ADMIN_PASSWORD not configured; skipped ${skippedTests.join(", ")}`,
      };
    }

    return {
      caseResults: skippedTests.map((caseId) => ({
        caseId,
        outcome: "preflight-only",
        reason: "Covered by the seeded hotfix-storefront-payment full-stack spec",
      })),
    };
  },
};

