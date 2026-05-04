-- Idempotent retry: some DBs still have BYTEA recipe_code (JPQL LOWER() then fails).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'production_recipes'
          AND column_name = 'recipe_code'
          AND udt_name = 'bytea'
    ) THEN
        ALTER TABLE production_recipes
            ALTER COLUMN recipe_code TYPE varchar(80)
            USING convert_from(recipe_code, 'UTF8');
    END IF;
END $$;
