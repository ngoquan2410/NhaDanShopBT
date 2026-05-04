-- Singleton shipping configuration for zone fallback, parcel defaults, and free-ship thresholds.
CREATE TABLE IF NOT EXISTS shipping_settings (
    id BIGINT PRIMARY KEY,
    zone_rules_json TEXT NOT NULL,
    parcel_defaults_json TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT shipping_settings_singleton CHECK (id = 1)
);
