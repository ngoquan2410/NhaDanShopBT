-- Persistent receipt lifecycle for void (history preserved, stock reversed per remaining batch qty).

ALTER TABLE inventory_receipts
    ADD COLUMN IF NOT EXISTS status      VARCHAR(32)  NOT NULL DEFAULT 'confirmed',
    ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMP    NULL,
    ADD COLUMN IF NOT EXISTS voided_by   VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS void_reason TEXT        NULL;

ALTER TABLE inventory_receipts
    ADD CONSTRAINT chk_inventory_receipts_status
    CHECK (status IN ('confirmed', 'voided'));
