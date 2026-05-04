-- Retry BYTEA→VARCHAR using current_schema(); some installs use non-public search_path while V28/V29 fixed only `public`.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'production_recipes'
          AND column_name = 'recipe_code'
          AND udt_name = 'bytea'
    ) THEN
        ALTER TABLE production_recipes
            ALTER COLUMN recipe_code TYPE varchar(80)
            USING convert_from(recipe_code, 'UTF8');
    END IF;
END $$;
