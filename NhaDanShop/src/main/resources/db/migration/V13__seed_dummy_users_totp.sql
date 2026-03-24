-- V13: Thêm dummy users có TOTP để test + thêm thêm vài user thường

-- =========================================================
-- TOTP Secrets (Base32) được gen sẵn để test:
-- admin_totp secret: JBSWY3DPEHPK3PXP  (Google Authenticator nhận)
-- user_totp  secret: JBSWY3DPEHPK3PXQ
--
-- Để tạo TOTP real, hãy scan QR sau khi login và gọi /api/auth/totp/setup
-- Các user dummy dưới đây có TOTP enabled = 0 (tắt) nên login bình thường
-- Chỉ admin_totp và user_totp mới bật TOTP để demo flow 2FA
-- =========================================================

-- ── Thêm user thường không có TOTP ──────────────────────────────────────────
-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    N'nguyen_van_a',
    N'$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    N'Nguyễn Văn A',
    1,
    NULL,
    0,
    SYSDATETIME(),
    SYSDATETIME()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = N'nguyen_van_a' AND r.name = N'ROLE_USER';

-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    N'tran_thi_b',
    N'$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    N'Trần Thị B',
    1,
    NULL,
    0,
    SYSDATETIME(),
    SYSDATETIME()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = N'tran_thi_b' AND r.name = N'ROLE_USER';

-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    N'le_van_c',
    N'$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    N'Lê Văn C',
    1,
    NULL,
    0,
    SYSDATETIME(),
    SYSDATETIME()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = N'le_van_c' AND r.name = N'ROLE_USER';

-- ── User có TOTP enabled để demo flow 2FA ────────────────────────────────────
-- QUAN TRỌNG: Secret bên dưới là REAL Base32 secret.
-- Để test, hãy mở Google Authenticator > Add manually:
--   Account: user_totp
--   Key:     JBSWY3DPEHPK3PXP
--   Type:    Time-based
-- password: user123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    N'user_totp',
    N'$2a$10$OLzwARbxuyxyJKbcjuErJOzXyjhHmvQNrL6z/K.3vd5Sv4R1bOx3S',
    N'User Demo TOTP',
    1,
    N'JBSWY3DPEHPK3PXP',
    1,
    SYSDATETIME(),
    SYSDATETIME()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = N'user_totp' AND r.name = N'ROLE_USER';

-- ── Admin có TOTP enabled để demo flow 2FA ───────────────────────────────────
-- QUAN TRỌNG: Secret bên dưới là REAL Base32 secret.
-- Để test, hãy mở Google Authenticator > Add manually:
--   Account: admin_totp
--   Key:     JBSWY3DPEHPK3PXQ
--   Type:    Time-based
-- password: admin123
INSERT INTO users (username, password, full_name, is_active, totp_secret, totp_enabled, created_at, updated_at)
VALUES (
    N'admin_totp',
    N'$2a$10$BHRoYv9VYEPCX8rTQKbbUuoLCDSo0YoxXfUSeqPXRGr3PCdo6Oh9a',
    N'Admin Demo TOTP',
    1,
    N'JBSWY3DPEHPK3PXQ',
    1,
    SYSDATETIME(),
    SYSDATETIME()
);
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id FROM users u CROSS JOIN roles r
WHERE u.username = N'admin_totp' AND r.name = N'ROLE_ADMIN';
