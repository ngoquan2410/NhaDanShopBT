-- ============================================================
-- Debug script: kiểm tra và fix user_roles data
-- Chạy trực tiếp trên SQL Server database: nhadanshop
-- ============================================================

-- 1. Kiểm tra bảng user_roles có tồn tại và có data không
SELECT 'user_roles count' AS check_name, COUNT(*) AS cnt FROM user_roles;

-- 2. Kiểm tra users
SELECT id, username, is_active FROM users;

-- 3. Kiểm tra roles
SELECT id, name FROM roles;

-- 4. Kiểm tra join
SELECT u.username, r.name AS role_name
FROM users u
LEFT JOIN user_roles ur ON ur.user_id = u.id
LEFT JOIN roles r ON r.id = ur.role_id;

-- ============================================================
-- FIX: Nếu user_roles rỗng, chạy phần này để insert lại
-- ============================================================

-- Xóa và insert lại để đảm bảo
DELETE FROM user_roles;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.username = N'admin' AND r.name = N'ROLE_ADMIN';

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE u.username = N'user' AND r.name = N'ROLE_USER';

-- Verify kết quả
SELECT u.username, r.name AS role_name
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id;
