
CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'casso',
  provider_tx_id text NOT NULL,
  amount bigint NOT NULL,
  transfer_content text NOT NULL DEFAULT '',
  matched_code text,
  bank_account text,
  bank_sub_acc text,
  tx_time timestamptz,
  raw_payload jsonb,
  linked_order_code text,
  linked_at timestamptz,
  linked_by text,
  status text NOT NULL DEFAULT 'unmatched',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_events_provider_tx_unique UNIQUE (provider, provider_tx_id)
);

CREATE INDEX idx_payment_events_status ON public.payment_events(status);
CREATE INDEX idx_payment_events_matched_code ON public.payment_events(matched_code);
CREATE INDEX idx_payment_events_tx_time ON public.payment_events(tx_time DESC);
CREATE INDEX idx_payment_events_created_at ON public.payment_events(created_at DESC);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Authenticated users (admin in this MVP) can read & update events.
CREATE POLICY "Authenticated can read payment_events"
  ON public.payment_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can update payment_events"
  ON public.payment_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
