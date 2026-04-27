
DROP POLICY IF EXISTS "Public can mark waiting_confirm or change method" ON public.pending_orders;

CREATE POLICY "Public can update own-stage statuses"
ON public.pending_orders
FOR UPDATE
TO anon, authenticated
USING (status IN ('pending', 'partial', 'waiting_confirm', 'confirmed', 'cancelled'))
WITH CHECK (status IN ('pending', 'partial', 'waiting_confirm', 'confirmed', 'cancelled'));
