-- =========================================================
-- V4: Reset passwords sang BCrypt hash đã verified
-- admin123 → $2a$10$slYQmyNdgzSrFnbBMbos8uOX8KMwMRqq6P6G.nK9JJI8dHJNvBRGO
-- user123  → $2a$10$HoMbzMHR7GWJ7a7W5v0lr.iXIpvNmCjByuYzRBt3F0OmzNMAmIKeC
-- =========================================================

-- Reset password admin = 'admin123'
UPDATE users
SET password   = '$2a$10$slYQmyNdgzSrFnbBMbos8uOX8KMwMRqq6P6G.nK9JJI8dHJNvBRGO',
    updated_at = NOW()
WHERE username = 'admin';

-- Reset password user = 'user123'
UPDATE users
SET password   = '$2a$10$HoMbzMHR7GWJ7a7W5v0lr.iXIpvNmCjByuYzRBt3F0OmzNMAmIKeC',
    updated_at = NOW()
WHERE username = 'user';

-- Đảm bảo user_roles có data
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.username = 'admin'
  AND r.name = 'ROLE_ADMIN'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.username = 'user'
  AND r.name = 'ROLE_USER'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
  );
