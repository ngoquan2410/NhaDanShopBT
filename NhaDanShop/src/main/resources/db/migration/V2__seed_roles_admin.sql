INSERT INTO roles(name, description) VALUES (N'ROLE_ADMIN', N'Administrator');
INSERT INTO roles(name, description) VALUES (N'ROLE_USER', N'Normal user');

-- password: admin123 (BCrypt)
INSERT INTO users(username, password, full_name, is_active, role_id)
SELECT
    N'admin',
    N'$2a$10$7QJ7vVYjM6f6P8WmA6O2V.wUe8nL2a6fM/3CwWf1D4v9j5m5Qf5bG',
    N'Administrator',
    1,
    r.id
FROM roles r
WHERE r.name = N'ROLE_ADMIN';