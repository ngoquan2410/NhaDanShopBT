-- V4: Enable unaccent extension để search tiếng Việt không dấu
-- VD: "manh" tìm được "Mạnh Hùng", "ncc" tìm được "NCC Đức Phát"

CREATE EXTENSION IF NOT EXISTS unaccent;

-- Tạo immutable wrapper function để dùng trong index (unaccent mặc định là STABLE, không dùng trong index)
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
  RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$
  SELECT unaccent($1);
$$;

-- Index tìm kiếm không dấu cho customers.name
CREATE INDEX IF NOT EXISTS idx_customers_name_unaccent
  ON customers (immutable_unaccent(lower(name)));

-- Index tìm kiếm không dấu cho suppliers.name
CREATE INDEX IF NOT EXISTS idx_suppliers_name_unaccent
  ON suppliers (immutable_unaccent(lower(name)));
