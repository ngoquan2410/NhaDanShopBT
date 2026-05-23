-- Align voucher LocalDateTime columns with project local timestamp policy.
-- Preserve Vietnam wall-clock values from prior TIMESTAMPTZ columns.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'vouchers'
          AND column_name = 'created_at'
          AND data_type = 'timestamp with time zone'
    ) THEN
        ALTER TABLE vouchers
            ALTER COLUMN created_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'vouchers'
          AND column_name = 'updated_at'
          AND data_type = 'timestamp with time zone'
    ) THEN
        ALTER TABLE vouchers
            ALTER COLUMN updated_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'vouchers'
          AND column_name = 'start_at'
          AND data_type = 'timestamp with time zone'
    ) THEN
        ALTER TABLE vouchers
            ALTER COLUMN start_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING start_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'vouchers'
          AND column_name = 'end_at'
          AND data_type = 'timestamp with time zone'
    ) THEN
        ALTER TABLE vouchers
            ALTER COLUMN end_at TYPE TIMESTAMP WITHOUT TIME ZONE
                USING end_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    END IF;

    ALTER TABLE vouchers
        ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP,
        ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
END $$;

