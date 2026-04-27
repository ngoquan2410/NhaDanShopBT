
-- ============ PENDING ORDERS ============
CREATE TABLE public.pending_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  customer_id text,
  customer_name text NOT NULL,
  customer_phone text,
  shipping_address jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  gift_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal bigint NOT NULL DEFAULT 0,
  discount bigint NOT NULL DEFAULT 0,
  shipping_fee bigint NOT NULL DEFAULT 0,
  total bigint NOT NULL DEFAULT 0,
  paid_amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  payment_type text NOT NULL DEFAULT 'transfer',
  promotion_snapshot jsonb,
  voucher_snapshot jsonb,
  shipping_quote_snapshot jsonb,
  pricing_breakdown_snapshot jsonb,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_orders_code ON public.pending_orders(code);
CREATE INDEX idx_pending_orders_status ON public.pending_orders(status);
CREATE INDEX idx_pending_orders_phone ON public.pending_orders(customer_phone);

ALTER TABLE public.pending_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access pending_orders"
ON public.pending_orders
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  code text,
  date date NOT NULL DEFAULT current_date,
  pending_order_id uuid REFERENCES public.pending_orders(id) ON DELETE SET NULL,
  customer_id text,
  customer_name text NOT NULL,
  customer_phone text,
  shipping_address jsonb,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  gift_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  subtotal bigint NOT NULL DEFAULT 0,
  discount bigint NOT NULL DEFAULT 0,
  shipping_fee bigint NOT NULL DEFAULT 0,
  total bigint NOT NULL DEFAULT 0,
  paid_amount bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  payment_type text NOT NULL DEFAULT 'cash',
  promotion_snapshot jsonb,
  voucher_snapshot jsonb,
  shipping_quote_snapshot jsonb,
  pricing_breakdown_snapshot jsonb,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_code ON public.invoices(code);
CREATE INDEX idx_invoices_number ON public.invoices(number);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_date ON public.invoices(date);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins full access invoices"
ON public.invoices
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ Allow admin manage payment_events (insert/delete for manual fixes) ============
CREATE POLICY "Admins can insert payment_events"
ON public.payment_events
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete payment_events"
ON public.payment_events
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- ============ Updated_at trigger function ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pending_orders_updated_at
BEFORE UPDATE ON public.pending_orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ Auto-apply payment trigger ============
CREATE OR REPLACE FUNCTION public.apply_payment_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_code text;
  po record;
  inv record;
  new_paid bigint;
  new_status text;
BEGIN
  target_code := COALESCE(NEW.matched_code, NEW.linked_order_code);
  IF target_code IS NULL OR length(target_code) = 0 THEN
    RETURN NEW;
  END IF;

  -- Try pending_orders first
  SELECT * INTO po FROM public.pending_orders WHERE code = target_code LIMIT 1;
  IF FOUND THEN
    new_paid := COALESCE(po.paid_amount, 0) + NEW.amount;
    IF new_paid >= po.total AND new_paid = po.total THEN
      new_status := 'paid';
    ELSIF new_paid > po.total THEN
      new_status := 'over';
    ELSE
      new_status := 'partial';
    END IF;

    UPDATE public.pending_orders
       SET paid_amount = new_paid,
           status = new_status
     WHERE id = po.id;

    UPDATE public.payment_events
       SET status = 'matched',
           linked_order_code = target_code,
           linked_at = COALESCE(linked_at, now())
     WHERE id = NEW.id;

    RETURN NEW;
  END IF;

  -- Else try invoices
  SELECT * INTO inv FROM public.invoices WHERE code = target_code OR number = target_code LIMIT 1;
  IF FOUND THEN
    new_paid := COALESCE(inv.paid_amount, 0) + NEW.amount;
    IF new_paid = inv.total THEN
      new_status := 'paid';
    ELSIF new_paid > inv.total THEN
      new_status := 'over';
    ELSE
      new_status := 'partial';
    END IF;

    UPDATE public.invoices
       SET paid_amount = new_paid,
           status = new_status
     WHERE id = inv.id;

    UPDATE public.payment_events
       SET status = 'matched',
           linked_order_code = target_code,
           linked_at = COALESCE(linked_at, now())
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payment_events_apply
AFTER INSERT ON public.payment_events
FOR EACH ROW EXECUTE FUNCTION public.apply_payment_event();

-- ============ Public RPC: customer lookup by code + phone ============
CREATE OR REPLACE FUNCTION public.get_order_by_code(_code text, _phone text)
RETURNS TABLE (
  id uuid,
  code text,
  customer_name text,
  customer_phone text,
  total bigint,
  paid_amount bigint,
  status text,
  payment_type text,
  items jsonb,
  shipping_address jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, code, customer_name, customer_phone, total, paid_amount,
         status, payment_type, items, shipping_address, created_at
  FROM public.pending_orders
  WHERE code = _code
    AND (
      _phone IS NULL
      OR customer_phone = _phone
      OR regexp_replace(COALESCE(customer_phone,''), '\D', '', 'g')
         = regexp_replace(COALESCE(_phone,''), '\D', '', 'g')
    )
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_code(text, text) TO anon, authenticated;

-- ============ Realtime ============
ALTER TABLE public.pending_orders REPLICA IDENTITY FULL;
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_events;
