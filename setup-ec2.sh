#!/bin/bash
# =============================================================
# setup-ec2.sh – Chạy 1 lần trên EC2 Ubuntu 22.04 mới
# Dùng: chmod +x setup-ec2.sh && sudo ./setup-ec2.sh
#
# Bao gồm:
#   - Java 21
#   - PostgreSQL 16 (local, thay thế RDS)
#   - Nginx
#   - Systemd service
#   - Backup script cron
# =============================================================

set -e

# ── Config — SỬA TRƯỚC KHI CHẠY ────────────────────────────
DB_PASSWORD="${DB_PASSWORD:-ChangeThis@Strong2026!}"
DB_NAME="nhadanshop"
DB_USER="nhadanshop_user"

echo "======================================================"
echo "  NhaDanShop – EC2 Setup (EC2 Postgres, no RDS)"
echo "======================================================"

# ── 1. Cập nhật hệ thống ──────────────────────────────────
echo "[1/8] Updating system..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget gnupg2 lsb-release software-properties-common

# ── 2. Cài Java 21 ────────────────────────────────────────
echo "[2/8] Installing Java 21..."
apt-get install -y openjdk-21-jdk
java -version

# ── 3. Cài PostgreSQL 16 ──────────────────────────────────
echo "[3/8] Installing PostgreSQL 16..."
# Thêm official PostgreSQL apt repo (mới nhất)
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | \
  gpg --dearmor -o /usr/share/keyrings/postgresql.gpg
echo "deb [signed-by=/usr/share/keyrings/postgresql.gpg] \
  https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -y
apt-get install -y postgresql-16 postgresql-contrib-16

systemctl enable postgresql
systemctl start postgresql

# Tạo database, user, grant quyền
sudo -u postgres psql << SQL
-- Tạo user
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = '$DB_USER') THEN
    CREATE USER $DB_USER WITH ENCRYPTED PASSWORD '$DB_PASSWORD';
  END IF;
END \$\$;

-- Tạo database
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Grant quyền
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
SQL

echo "✅ PostgreSQL setup done — DB: $DB_NAME, User: $DB_USER"

# ── 4. Cấu hình PostgreSQL bảo mật ───────────────────────
echo "[4/8] Hardening PostgreSQL..."
PG_CONF="/etc/postgresql/16/main/postgresql.conf"
PG_HBA="/etc/postgresql/16/main/pg_hba.conf"

# Chỉ listen localhost — không expose ra internet
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" $PG_CONF
# Tối ưu cho t3.micro (1GB RAM)
sed -i "s/^shared_buffers = .*/shared_buffers = 256MB/" $PG_CONF
sed -i "s/^#max_connections = .*/max_connections = 50/" $PG_CONF

# pg_hba.conf: chỉ cho local connection bằng password
cat > $PG_HBA << 'HBA'
# TYPE  DATABASE    USER              ADDRESS         METHOD
local   all         postgres                          peer
local   all         all                               md5
host    nhadanshop  nhadanshop_user   127.0.0.1/32    scram-sha-256
host    nhadanshop  nhadanshop_user   ::1/128         scram-sha-256
HBA

systemctl restart postgresql
echo "✅ PostgreSQL hardened — chỉ cho phép localhost"

# ── 5. Cài Nginx ──────────────────────────────────────────
echo "[5/8] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

cat > /etc/nginx/sites-available/nhadanshop << 'NGINX'
server {
    listen 80;
    server_name _;

    # Frontend — React SPA
    root /var/www/nhadanshop;
    index index.html;

    # SPA routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API — proxy đến Spring Boot
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # Import Excel (tối đa 20MB)
    client_max_body_size 20M;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
}
NGINX

ln -sf /etc/nginx/sites-available/nhadanshop /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
echo "✅ Nginx configured"

# ── 6. Tạo thư mục app ────────────────────────────────────
echo "[6/8] Creating app directories..."
mkdir -p /app/nhadanshop
mkdir -p /var/www/nhadanshop
mkdir -p /var/backups/postgres
chown -R ubuntu:ubuntu /app/nhadanshop
chown -R www-data:www-data /var/www/nhadanshop
chown -R ubuntu:ubuntu /var/backups/postgres

# ── 7. Tạo systemd service ────────────────────────────────
echo "[7/8] Creating systemd service..."
cat > /etc/systemd/system/nhadanshop.service << SERVICE
[Unit]
Description=NhaDanShop Spring Boot Application
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/app/nhadanshop

# PostgreSQL LOCAL — cùng EC2, không dùng RDS
Environment="SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/${DB_NAME}"
Environment="SPRING_DATASOURCE_USERNAME=${DB_USER}"
Environment="SPRING_DATASOURCE_PASSWORD=${DB_PASSWORD}"
Environment="SPRING_JPA_HIBERNATE_DDL_AUTO=validate"
Environment="SPRING_FLYWAY_ENABLED=true"
Environment="SERVER_PORT=8080"

# JVM — tối ưu t3.micro 1GB RAM
ExecStart=/usr/bin/java \\
  -Xmx512m -Xms256m \\
  -jar /app/nhadanshop/nhadanshop.jar

Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nhadanshop

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable nhadanshop
echo "✅ Systemd service created"

# ── 8. Backup script ─────────────────────────────────────
echo "[8/8] Setting up daily backup..."
cat > /opt/backup-postgres.sh << BACKUP
#!/bin/bash
# Backup PostgreSQL → local + optional S3
set -e
DATE=\$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/postgres"
FILE="\$BACKUP_DIR/${DB_NAME}_\$DATE.sql.gz"
mkdir -p \$BACKUP_DIR
PGPASSWORD="${DB_PASSWORD}" pg_dump -h localhost -U ${DB_USER} -d ${DB_NAME} \
  --no-owner --no-privileges | gzip > \$FILE
# Xóa backup cũ hơn 7 ngày
find \$BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete
echo "[\$(date)] Backup OK: \$FILE (\$(du -sh \$FILE | cut -f1))"
BACKUP

chmod +x /opt/backup-postgres.sh

# Cron: backup lúc 2:00 AM hàng ngày
(crontab -u ubuntu -l 2>/dev/null; \
  echo "0 2 * * * /opt/backup-postgres.sh >> /var/log/pg-backup.log 2>&1") \
  | crontab -u ubuntu -
echo "✅ Daily backup cron set at 2:00 AM"

echo ""
echo "======================================================"
echo "  ✅ Setup hoàn tất!"
echo "======================================================"
echo ""
echo "  📋 Bước tiếp theo:"
echo "  1. Upload JAR:   scp nhadanshop.jar ubuntu@<IP>:/app/nhadanshop/"
echo "  2. Upload UI:    rsync -avz dist/ ubuntu@<IP>:/var/www/nhadanshop/"
echo "  3. Start app:    sudo systemctl start nhadanshop"
echo "  4. Xem log:      sudo journalctl -u nhadanshop -f"
echo "  5. Health check: curl http://localhost:8080/actuator/health"
echo ""
echo "  🗄️ PostgreSQL:"
echo "     Host: localhost:5432"
echo "     DB:   $DB_NAME"
echo "     User: $DB_USER"
echo "     Pass: $DB_PASSWORD"
echo ""
echo "  💾 Backup:"
echo "     Script: /opt/backup-postgres.sh"
echo "     Cron:   2:00 AM hàng ngày"
echo "     Folder: /var/backups/postgres/"
echo ""
echo "  ⚠️  SECURITY: Đảm bảo port 5432 KHÔNG mở trong AWS Security Group!"
echo ""
