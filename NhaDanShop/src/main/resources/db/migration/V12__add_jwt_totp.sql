-- V12: Thêm cột TOTP (Google Authenticator) và refresh_token vào bảng users

ALTER TABLE users
    ADD totp_secret  VARCHAR(64) NULL,          -- Base32 secret cho TOTP
    ADD totp_enabled BOOLEAN     NOT NULL DEFAULT FALSE; -- TOTP đã kích hoạt?

-- Bảng lưu refresh token (blacklist / rotation)
CREATE TABLE refresh_tokens (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL,
    token_hash  VARCHAR(64)  NOT NULL UNIQUE,  -- SHA-256 của refresh token
    expires_at  TIMESTAMP    NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX ix_refresh_tokens_user_id    ON refresh_tokens(user_id);
CREATE INDEX ix_refresh_tokens_token_hash ON refresh_tokens(token_hash);
