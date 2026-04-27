-- V8: Minimal functional indexes for text-search hot paths.
-- Keep this migration idempotent for existing environments.

-- Customers: matches searchActive predicates
CREATE INDEX IF NOT EXISTS idx_customers_code_lower
  ON customers (lower(code));

CREATE INDEX IF NOT EXISTS idx_customers_phone_lower
  ON customers (lower(coalesce(phone, '')));

-- Suppliers: matches searchActive predicates
CREATE INDEX IF NOT EXISTS idx_suppliers_code_lower
  ON suppliers (lower(code));

CREATE INDEX IF NOT EXISTS idx_suppliers_phone_lower
  ON suppliers (lower(coalesce(phone, '')));

-- Product variants: hot lookup/search columns for admin/POS text search
CREATE INDEX IF NOT EXISTS idx_product_variants_code_lower
  ON product_variants (lower(variant_code));

CREATE INDEX IF NOT EXISTS idx_product_variants_name_unaccent
  ON product_variants (immutable_unaccent(lower(variant_name)));
