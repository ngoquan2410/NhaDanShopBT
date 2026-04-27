-- Slice 5: non-sellable = still active for inventory, hidden from POS/storefront sales
ALTER TABLE product_variants
    ADD COLUMN is_sellable BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN product_variants.is_sellable IS
    'FALSE = not offered on POS/online; TRUE = can sell. Distinct from is_active (archive).';
