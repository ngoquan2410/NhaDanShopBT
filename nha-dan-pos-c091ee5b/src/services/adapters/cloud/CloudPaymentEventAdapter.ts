// Cloud-backed adapter for payment_events. UI must NOT import this directly.
import { supabase } from "@/integrations/supabase/client";
import type {
  PaymentEvent,
  PaymentEventService,
} from "@/services/paymentEvents/PaymentEventService";

type Row = {
  id: string;
  provider: string;
  provider_tx_id: string;
  amount: number;
  transfer_content: string;
  matched_code: string | null;
  bank_account: string | null;
  bank_sub_acc: string | null;
  tx_time: string | null;
  linked_order_code: string | null;
  linked_at: string | null;
  linked_by: string | null;
  status: string;
  created_at: string;
};

function toEvent(r: Row): PaymentEvent {
  return {
    id: r.id,
    provider: r.provider,
    providerTxId: r.provider_tx_id,
    amount: Number(r.amount),
    transferContent: r.transfer_content,
    matchedCode: r.matched_code,
    bankAccount: r.bank_account,
    bankSubAcc: r.bank_sub_acc,
    txTime: r.tx_time,
    linkedOrderCode: r.linked_order_code,
    linkedAt: r.linked_at,
    linkedBy: r.linked_by,
    status: (r.status as PaymentEvent["status"]) ?? "unmatched",
    createdAt: r.created_at,
  };
}

export class CloudPaymentEventAdapter implements PaymentEventService {
  async listRecent(limit = 50): Promise<PaymentEvent[]> {
    const { data, error } = await supabase
      .from("payment_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Row[] | null)?.map(toEvent) ?? [];
  }

  async listUnmatched(limit = 100): Promise<PaymentEvent[]> {
    const { data, error } = await supabase
      .from("payment_events")
      .select("*")
      .is("linked_order_code", null)
      .neq("status", "ignored")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Row[] | null)?.map(toEvent) ?? [];
  }

  async findByOrderCode(code: string): Promise<PaymentEvent[]> {
    const upper = code.toUpperCase();
    const { data, error } = await supabase
      .from("payment_events")
      .select("*")
      .or(`matched_code.eq.${upper},linked_order_code.eq.${upper}`)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data as Row[] | null)?.map(toEvent) ?? [];
  }

  async linkToOrder(
    eventId: string,
    orderCode: string,
    by: "auto" | "admin",
  ): Promise<PaymentEvent> {
    const { data, error } = await supabase
      .from("payment_events")
      .update({
        linked_order_code: orderCode.toUpperCase(),
        linked_at: new Date().toISOString(),
        linked_by: by,
        status: "linked",
      })
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) throw error;
    return toEvent(data as Row);
  }

  async markIgnored(eventId: string): Promise<PaymentEvent> {
    const { data, error } = await supabase
      .from("payment_events")
      .update({ status: "ignored" })
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) throw error;
    return toEvent(data as Row);
  }

  async unmarkIgnored(eventId: string): Promise<PaymentEvent> {
    // Restore to "unmatched" so the row reappears in the admin worklist.
    // We don't touch matched_code/linked_order_code so any extracted hint stays.
    const { data, error } = await supabase
      .from("payment_events")
      .update({ status: "unmatched" })
      .eq("id", eventId)
      .select("*")
      .single();
    if (error) throw error;
    return toEvent(data as Row);
  }

  async listIgnored(limit = 100): Promise<PaymentEvent[]> {
    const { data, error } = await supabase
      .from("payment_events")
      .select("*")
      .eq("status", "ignored")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data as Row[] | null)?.map(toEvent) ?? [];
  }

  async countUnmatched(): Promise<number> {
    const { count, error } = await supabase
      .from("payment_events")
      .select("*", { count: "exact", head: true })
      .is("linked_order_code", null)
      .neq("status", "ignored");
    if (error) throw error;
    return count ?? 0;
  }
}
