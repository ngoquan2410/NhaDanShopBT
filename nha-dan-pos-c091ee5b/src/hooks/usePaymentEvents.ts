import { useEffect, useRef, useState, useCallback } from "react";
import { paymentEvents as paymentEventsService } from "@/services";
import type { PaymentEvent } from "@/services";

interface Options {
  /** Order code to watch (e.g. "DH-20240115-1234"). Polling auto-stops when matched. */
  orderCode?: string;
  /** Required amount (VND) before considering a payment auto-confirmable. */
  requiredAmount?: number;
  /** Poll interval in ms (default 12s). Pauses when tab hidden. */
  intervalMs?: number;
  /** When true, hook is active. Set false to stop (e.g. order already paid). */
  enabled?: boolean;
}

interface State {
  matchedEvent: PaymentEvent | null;
  insufficientEvent: PaymentEvent | null;
  loading: boolean;
  error: string | null;
}

/**
 * Polls Cloud `payment_events` for the given order code.
 * Returns the first event whose amount is >= requiredAmount as `matchedEvent`.
 * Events with amount < required surface as `insufficientEvent` so the UI
 * can warn the customer to top up; admin still handles them via the
 * "Unmatched payments" page.
 */
export function usePaymentEvents({
  orderCode,
  requiredAmount,
  intervalMs = 12000,
  enabled = true,
}: Options): State & { refresh: () => void } {
  const [state, setState] = useState<State>({
    matchedEvent: null,
    insufficientEvent: null,
    loading: false,
    error: null,
  });
  const stoppedRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!orderCode || !enabled) return;
    setState((s) => ({ ...s, loading: true }));
    try {
      const events = await paymentEventsService.findByOrderCode(orderCode);
      const valid = events.filter((e) => e.status !== "ignored");
      const required = requiredAmount ?? 0;
      const sufficient = valid.find((e) => e.amount >= required) ?? null;
      const insufficient = !sufficient
        ? valid.find((e) => e.amount > 0 && e.amount < required) ?? null
        : null;
      setState({
        matchedEvent: sufficient,
        insufficientEvent: insufficient,
        loading: false,
        error: null,
      });
      if (sufficient) stoppedRef.current = true;
    } catch (e: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e?.message ?? "Không kiểm tra được giao dịch",
      }));
    }
  }, [orderCode, requiredAmount, enabled]);

  useEffect(() => {
    stoppedRef.current = false;
    if (!orderCode || !enabled) return;

    void fetchOnce();

    const tick = () => {
      if (stoppedRef.current) return;
      if (document.visibilityState !== "visible") return;
      void fetchOnce();
    };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !stoppedRef.current) {
        void fetchOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [orderCode, enabled, intervalMs, fetchOnce]);

  return { ...state, refresh: fetchOnce };
}
