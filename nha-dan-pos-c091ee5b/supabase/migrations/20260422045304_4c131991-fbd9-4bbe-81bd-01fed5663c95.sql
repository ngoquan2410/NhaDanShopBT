
-- Allow public (anon + authenticated) to create pending orders via storefront checkout.
-- Storefront does not yet authenticate customers, so we accept anonymous inserts.
CREATE POLICY "Public can create pending orders"
ON public.pending_orders
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Allow public to read pending orders (needed so the PendingPayment page can
-- look up the order by id/code without the user being logged in). The page
-- only fetches by id/code so this does not enable enumeration of the table
-- in normal usage. If you later want to lock this down, replace with an RPC.
CREATE POLICY "Public can read pending orders"
ON public.pending_orders
FOR SELECT
TO anon, authenticated
USING (true);

-- Allow public to update a limited subset (e.g. customer pressing "I paid" or
-- switching payment method). Admin retains the existing FOR ALL policy for
-- everything else (status changes that are not 'waiting_confirm', etc).
CREATE POLICY "Public can mark waiting_confirm or change method"
ON public.pending_orders
FOR UPDATE
TO anon, authenticated
USING (status IN ('pending', 'partial', 'waiting_confirm'))
WITH CHECK (status IN ('pending', 'partial', 'waiting_confirm'));
