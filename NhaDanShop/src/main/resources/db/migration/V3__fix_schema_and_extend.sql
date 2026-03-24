-- =========================================================
-- V3: Fix mâu thuẫn schema users/roles
-- DB hiện tại (V1+V2): roles có cột 'name' (ROLE_ADMIN, ROLE_USER),
-- users có cột 'role_id' FK trực tiếp vào roles.
-- Entity Java dùng ManyToMany qua bảng user_roles.
-- Migration này: tạo bảng user_roles, migrate data, drop role_id.
-- =========================================================

-- Bước 1: Tạo bảng user_roles (junction table)
CREATE TABLE user_roles (
    user_id BIGINT NOT NULL,
    role_id BIGINT NOT NULL,
    CONSTRAINT pk_user_roles PRIMARY KEY (user_id, role_id),
    CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id)
);

-- Bước 2: Migrate dữ liệu từ users.role_id sang user_roles
INSERT INTO user_roles (user_id, role_id)
SELECT id, role_id FROM users WHERE role_id IS NOT NULL;

-- Bước 3: Drop FK constraint rồi drop cột role_id
ALTER TABLE users DROP CONSTRAINT fk_users_role;
ALTER TABLE users DROP COLUMN role_id;

-- Bước 4: Thêm index cho hiệu suất
CREATE INDEX ix_user_roles_user_id ON user_roles(user_id);
CREATE INDEX ix_user_roles_role_id ON user_roles(role_id);

-- Bước 5: Seed user ROLE_USER mẫu (password: user123)
INSERT INTO users(username, password, full_name, is_active, created_at, updated_at)
VALUES (
    N'user',
    N'$2a$10$N.YYHSMQyGu4D8YNS1B0HOdN4lgSN/8B0TJaKH5jbVPvYJuM5X5kC',
    N'Normal User',
    1,
    SYSDATETIME(),
    SYSDATETIME()
);

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u, roles r
WHERE u.username = N'user' AND r.name = N'ROLE_USER';
