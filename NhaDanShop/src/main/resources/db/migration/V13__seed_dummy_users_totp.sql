-- V13: Thêm dummy users có TOTP để test + thêm thêm vài user thường

-- =========================================================
-- TOTP Secrets (Base32) được gen sẵn để test:
-- admin_totp secret: JBSWY3DPEHPK3PXP  (Google Authenticator nhận)
-- user_totp  secret: JBSWY3DPEHPK3PXQ
--
-- Để tạo TOTP real, hãy scan QR sau khi login và gọi /api/auth/totp/setup
-- Các user dummy dưới đây có TOTP enabled = FALSE (tắt) nên login bình thường
-- Chỉ admin_totp và user_totp mới bật TOTP để demo flow 2FA
-- =========================================================

-- ── Thêm user thường không có TOTP ──────────────────────────────────────────
-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    'nguyen_van_a',
    '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    'Nguyễn Văn A',
    TRUE,
    NULL,
    FALSE,
    NOW(),
    NOW()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'nguyen_van_a' AND r.name = 'ROLE_USER';

-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    'tran_thi_b',
    '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    'Trần Thị B',
    TRUE,
    NULL,
    FALSE,
    NOW(),
    NOW()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'tran_thi_b' AND r.name = 'ROLE_USER';

-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    'le_van_c',
    '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    'Lê Văn C',
    TRUE,
    NULL,
    FALSE,
    NOW(),
    NOW()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'le_van_c' AND r.name = 'ROLE_USER';

-- ── User có TOTP enabled để demo flow 2FA ────────────────────────────────────
-- QUAN TRỌNG: Secret bên dưới là REAL Base32 secret.
-- Để test, hãy mở Google Authenticator > Add manually:
--   Account: user_totp
--   Key:     JBSWY3DPEHPK3PXP
--   Type:    Time-based
-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    'user_totp',
    '$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    'User Demo TOTP',
    TRUE,
    'JBSWY3DPEHPK3PXP',
    TRUE,
    NOW(),
    NOW()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'user_totp' AND r.name = 'ROLE_USER';

-- ── Admin có TOTP enabled để demo flow 2FA ───────────────────────────────────
-- QUAN TRỌNG: Secret bên dưới là REAL Base32 secret.
-- Để test, hãy mở Google Authenticator > Add manually:
--   Account: admin_totp
--   Key:     JBSWY3DPEHPK3PXQ
--   Type:    Time-based
-- password: admin123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    'admin_totp',
    '$2a$10$BHRoYv9VYEPCX8rTQKbbUuoLCDSo0YoxXfUSeqPXRGr3PCdo6Oh9a',
    'Admin Demo TOTP',
    TRUE,
    'JBSWY3DPEHPK3PXQ',
    TRUE,
    NOW(),
    NOW()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = 'admin_totp' AND r.name = 'ROLE_ADMIN';
