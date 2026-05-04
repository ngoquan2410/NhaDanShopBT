-- V32: Force BYTEA→VARCHAR when pg_catalog still reports bytea (information_schema checks in V30/V31 can miss some PG builds).
DO $$
DECLARE
  recipe_type text;
  order_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO recipe_type
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema()
    AND c.relname = 'production_recipes'
    AND a.attname = 'recipe_code'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF recipe_type = 'bytea' THEN
    ALTER TABLE production_recipes
      ALTER COLUMN recipe_code TYPE varchar(80)
      USING convert_from(recipe_code, 'UTF8');
  END IF;

  SELECT format_type(a.atttypid, a.atttypmod) INTO order_type
  FROM pg_catalog.pg_attribute a
  JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = current_schema()
    AND c.relname = 'production_orders'
    AND a.attname = 'order_no'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF order_type = 'bytea' THEN
    ALTER TABLE production_orders
      ALTER COLUMN order_no TYPE varchar(50)
      USING convert_from(order_no, 'UTF8');
  END IF;
END $$;
