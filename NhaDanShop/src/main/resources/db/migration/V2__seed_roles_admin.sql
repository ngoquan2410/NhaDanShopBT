INSERT INTO roles(name, description) VALUES ('ROLE_ADMIN', 'Administrator');
INSERT INTO roles(name, description) VALUES ('ROLE_USER', 'Normal user');

-- password: admin123 (BCrypt)
INSERT INTO users(username, password, full_name, is_active, role_id)
SELECT
    'admin',
    '$2a$10$7QJ7vVYjM6f6P8WmA6O2V.wUe8nL2a6fM/3CwWf1D4v9j5m5Qf5bG',
    'Administrator',
    TRUE,
    r.id
FROM roles r
WHERE r.name = 'ROLE_ADMIN';
