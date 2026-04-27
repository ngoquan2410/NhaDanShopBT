-- Attach the apply_payment_event trigger to payment_events.
-- The function already exists; we re-create the trigger to ensure it's wired up.
DROP TRIGGER IF EXISTS trg_apply_payment_event ON public.payment_events;

CREATE TRIGGER trg_apply_payment_event
AFTER INSERT ON public.payment_events
FOR EACH ROW
EXECUTE FUNCTION public.apply_payment_event();