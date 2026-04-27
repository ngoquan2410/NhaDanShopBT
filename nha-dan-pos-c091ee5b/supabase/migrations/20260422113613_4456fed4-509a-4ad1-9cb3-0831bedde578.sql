-- GHN quote logs
CREATE TABLE public.ghn_quote_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  province_name TEXT,
  district_name TEXT,
  ward_name TEXT,
  weight_grams INTEGER,
  subtotal BIGINT,
  ok BOOLEAN NOT NULL DEFAULT false,
  fee BIGINT,
  eta_min INTEGER,
  eta_max INTEGER,
  service_id INTEGER,
  reason TEXT,
  message TEXT,
  latency_ms INTEGER,
  order_code TEXT,
  raw_response JSONB
);

CREATE INDEX idx_ghn_quote_logs_created_at ON public.ghn_quote_logs (created_at DESC);
CREATE INDEX idx_ghn_quote_logs_order_code ON public.ghn_quote_logs (order_code);

ALTER TABLE public.ghn_quote_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all logs
CREATE POLICY "Admins can read ghn_quote_logs"
ON public.ghn_quote_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Allow inserts from anyone (edge function uses service role anyway; this also allows
-- anonymous storefront sessions to log their quote attempts).
CREATE POLICY "Anyone can insert ghn_quote_logs"
ON public.ghn_quote_logs
FOR INSERT
TO anon, authenticated
WITH CHECK (true);
