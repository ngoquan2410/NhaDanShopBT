-- V31: Last-resort normalize production_* string columns mistaken as BYTEA (JPQL LOWER() fails on bytea in PostgreSQL).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'production_recipes'
          AND c.column_name = 'recipe_code'
          AND c.udt_name = 'bytea'
    ) THEN
        ALTER TABLE production_recipes
            ALTER COLUMN recipe_code TYPE varchar(80)
            USING convert_from(recipe_code, 'UTF8');
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns c
        WHERE c.table_schema = current_schema()
          AND c.table_name = 'production_orders'
          AND c.column_name = 'order_no'
          AND c.udt_name = 'bytea'
    ) THEN
        ALTER TABLE production_orders
            ALTER COLUMN order_no TYPE varchar(50)
            USING convert_from(order_no, 'UTF8');
    END IF;
END $$;
