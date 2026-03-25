#!/bin/bash
# =============================================================
# setup-ec2.sh – Chạy 1 lần trên EC2 Ubuntu 22.04 mới
# Cách dùng: chmod +x setup-ec2.sh && sudo ./setup-ec2.sh
# =============================================================

set -e

echo "======================================================"
echo "  NhaDanShop – EC2 Setup Script"
echo "======================================================"

# ── 1. Cập nhật hệ thống ──────────────────────────────────
echo "[1/7] Updating system..."
apt-get update -y && apt-get upgrade -y

# ── 2. Cài Java 21 ────────────────────────────────────────
echo "[2/7] Installing Java 21..."
apt-get install -y openjdk-21-jdk
java -version

# ── 3. Cài Nginx ──────────────────────────────────────────
echo "[3/7] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── 4. Cài PostgreSQL 16 ──────────────────────────────────
echo "[4/7] Installing PostgreSQL 16..."
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql

# Tạo database và user
sudo -u postgres psql <<EOF
CREATE DATABASE nhadanshop;
CREATE USER nhadanshop_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE nhadanshop TO nhadanshop_user;
\c nhadanshop
GRANT ALL ON SCHEMA public TO nhadanshop_user;
EOF

echo "PostgreSQL setup done!"

# ── 5. Tạo thư mục app ────────────────────────────────────
echo "[5/7] Creating app directories..."
mkdir -p /app/nhadanshop
mkdir -p /var/www/nhadanshop
chown -R ubuntu:ubuntu /app/nhadanshop
chown -R www-data:www-data /var/www/nhadanshop
chmod 755 /var/www/nhadanshop

# ── 6. Tạo systemd service cho Spring Boot ────────────────
echo "[6/7] Creating systemd service..."
cat > /etc/systemd/system/nhadanshop.service <<EOF
[Unit]
Description=NhaDanShop Spring Boot Application
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/app/nhadanshop
ExecStart=/usr/bin/java -jar /app/nhadanshop/nhadanshop.jar \
  --spring.datasource.url=jdbc:postgresql://localhost:5432/nhadanshop \
  --spring.datasource.username=nhadanshop_user \
  --spring.datasource.password=CHANGE_THIS_PASSWORD \
  --server.port=8080
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nhadanshop

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nhadanshop

# ── 7. Cấu hình Nginx ─────────────────────────────────────
echo "[7/7] Configuring Nginx..."
cat > /etc/nginx/sites-available/nhadanshop <<EOF
server {
    listen 80;
    server_name _;   # Thay bằng domain của bạn sau

    # Frontend – React build
    root /var/www/nhadanshop;
    index index.html;

    # SPA routing – tất cả route về index.html
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API – proxy đến Spring Boot
    location /api/ {
        proxy_pass http://localhost:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }

    # Tăng giới hạn upload (import Excel)
    client_max_body_size 20M;
}
EOF

ln -sf /etc/nginx/sites-available/nhadanshop /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo ""
echo "======================================================"
echo "  ✅ Setup hoàn tất!"
echo "======================================================"
echo ""
echo "  Các bước tiếp theo:"
echo "  1. Upload JAR:  scp nhadanshop.jar ubuntu@<IP>:/app/nhadanshop/"
echo "  2. Upload UI:   rsync -avz dist/ ubuntu@<IP>:/var/www/nhadanshop/"
echo "  3. Start app:   sudo systemctl start nhadanshop"
echo "  4. Xem log:     sudo journalctl -u nhadanshop -f"
echo "  5. Test:        curl http://localhost:8080/actuator/health"
echo ""
echo "  ⚠️  NHỚ đổi password DB trong /etc/systemd/system/nhadanshop.service"
echo ""
