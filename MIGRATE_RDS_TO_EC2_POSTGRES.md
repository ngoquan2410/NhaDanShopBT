# 🗄️ Migrate: AWS RDS → PostgreSQL tự host trên EC2

> Ngày: 12/04/2026 | EC2: Ubuntu 22.04 LTS | **DB mới hoàn toàn, không cần migrate data**

---

## 1. 💰 So sánh chi phí: RDS vs EC2 self-hosted

### RDS PostgreSQL (db.t3.micro — cấu hình thấp nhất)
| Mục | Chi phí/tháng |
|---|---|
| db.t3.micro (2 vCPU, 1GB RAM) | ~$13–15/tháng |
| Storage 20GB gp2 | ~$2.30/tháng |
| Backup storage (7 ngày) | ~$1–2/tháng |
| Multi-AZ (nếu bật) | x2 = ~$30/tháng |
| **Tổng RDS (Single-AZ)** | **~$16–19/tháng** |
| **Tổng RDS (Multi-AZ)** | **~$32–38/tháng** |

### PostgreSQL tự host trên EC2 (cùng EC2 với app)
| Mục | Chi phí/tháng |
|---|---|
| EC2 t3.micro đang chạy app | $0 (đã có) |
| Thêm 20GB EBS cho data | ~$2/tháng |
| **Tổng** | **~$2/tháng** |

### ✅ Kết luận tiết kiệm
```
RDS:          ~$17/tháng
EC2 Postgres: ~$2/tháng
──────────────────────
Tiết kiệm:    ~$15/tháng = ~$180/năm
```

### ⚠️ Đánh đổi khi bỏ RDS
| Tính năng | RDS | EC2 self-hosted |
|---|---|---|
| Automated backup | ✅ Tự động | ⚠️ Phải tự làm (cron job) |
| Failover tự động | ✅ Multi-AZ | ❌ Không có |
| Patch OS/DB | ✅ AWS lo | ⚠️ Tự cập nhật |
| Performance monitoring | ✅ CloudWatch | ⚠️ Tự setup |
| Scaling | ✅ Click chuột | ⚠️ Phải resize EC2 |
| **Phù hợp với** | Production lớn | **Shop nhỏ, dev, staging** ✅ |

---

## 2. 🔒 Fix IP thay đổi — Phân tích giải pháp

### Tại sao IP thay đổi?
EC2 mặc định dùng **Dynamic Public IP** → mỗi lần **Stop/Start** là đổi IP mới.
Đây là lý do `known_hosts` có nhiều IP khác nhau (`13.251.16.99`, `13.214.189.73`, `47.129.188.27`).

---

### 📊 So sánh 3 giải pháp

| Giải pháp | Chi phí/tháng | Độ phức tạp | Phù hợp khi |
|---|---|---|---|
| **A. Elastic IP** | $0 (24/7) hoặc **~$3.60** (stop cả tháng) | Thấp — 1 lần setup | Chạy 24/7, ít stop |
| **B. Script tự động lấy IP** ✅ | **$0 hoàn toàn** | Trung bình — script + AWS CLI | **Stop hàng ngày** ✅ |
| **C. Đổi IP tay** | $0 | Cao — thủ công mỗi ngày | Không khuyến nghị |

> **NhaDanShop stop server hàng ngày → Chọn Giải pháp B** — tiết kiệm $0 thêm, không lo tốn phí

---

### 💡 Giải pháp B — Script tự động lấy IP → cập nhật GitHub Secret

#### Nguyên lý hoạt động

```
Mỗi sáng khi Start EC2:
  AWS cấp IP mới, ví dụ: 54.251.88.10
        ↓
  Chạy script: .\start-dev.ps1
        ↓
  ┌─────────────────────────────────────────────────┐
  │ 1. aws ec2 describe-instances --instance-ids    │
  │    i-0abc1234  → PublicIpAddress: 54.251.88.10  │
  │                                                  │
  │ 2. Cập nhật SSH config:                         │
  │    HostName 54.251.88.10                        │
  │                                                  │
  │ 3. Gọi GitHub API:                              │
  │    PATCH /repos/.../secrets/EC2_HOST            │
  │    value = 54.251.88.10                         │
  └─────────────────────────────────────────────────┘
        ↓
  ssh nhadanshop    ← SSH dùng được ngay ✅
  git push          ← GitHub Actions deploy IP mới ✅
```

> **Instance ID** (`i-0abc1234...`) là định danh cố định của EC2, **không bao giờ thay đổi** dù Stop/Start hay IP đổi → dùng làm "địa chỉ tra cứu" để hỏi IP hiện tại.

---

#### 🔧 Thành phần cần chuẩn bị (1 lần duy nhất)

| Thành phần | Mục đích | Cách lấy |
|---|---|---|
| **Instance ID** | Định danh EC2 cố định | AWS Console → EC2 → Instances → Instance ID |
| **AWS CLI** | Gọi AWS API lấy IP | `winget install Amazon.AWSCLI` |
| **IAM User + Access Key** | Xác thực AWS API | AWS Console → IAM → Users → Create |
| **GitHub PAT** | Cập nhật GitHub Secret | GitHub → Settings → Developer settings → Tokens |

**Quyền IAM tối thiểu** (chỉ đọc, không can thiệp EC2):
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ec2:DescribeInstances"],
    "Resource": "*"
  }]
}
```

**GitHub PAT scope cần**: chỉ tick `repo` → `secrets` (hoặc dùng Fine-grained PAT: `Read and Write` cho `Secrets`)

---

#### 💰 Chi phí hoàn toàn $0

| Mục | Chi phí | Ghi chú |
|---|---|---|
| AWS `describe-instances` API call | **$0** | EC2 management API miễn phí |
| GitHub REST API call | **$0** | Miễn phí không giới hạn |
| IAM User | **$0** | |
| GitHub PAT | **$0** | |
| **Tổng** | **$0/tháng** ✅ | |

---

#### 💰 Tổng chi phí tháng khi stop 14h/ngày

| Mục | Tính toán | Chi phí/tháng |
|---|---|---|
| EC2 t3.micro chạy 10h/ngày | $0.0104/giờ × 10h × 30 ngày | **~$3.12** |
| EC2 (trong Free Tier 12 tháng đầu) | Miễn phí | **$0** |
| EBS 20GB (tính cả khi EC2 stop) | $0.10/GB × 20GB | **~$2.00** |
| Elastic IP | Không dùng | **$0** |
| Script / API calls | Miễn phí | **$0** |
| **Tổng (hết Free Tier)** | | **~$5.12/tháng** |
| **Tổng (trong Free Tier)** | | **~$2.00/tháng** |

> So với trước (EC2 24/7 + RDS) = ~$25/tháng → **tiết kiệm ~$20-23/tháng = ~$250/năm** 🎉

---

#### ⚠️ Nhược điểm & Cách xử lý

| Vấn đề | Mức độ | Cách xử lý |
|---|---|---|
| Phải chạy script mỗi sáng | Thấp | Tạo shortcut Desktop, double-click là xong |
| Quên chạy → deploy sai IP | Trung bình | Script tự kiểm tra và cảnh báo trước `git push` |
| GitHub Actions đang chạy khi IP đổi | Hiếm | Chỉ push code sau khi script chạy xong |
| AWS credentials lưu trên máy | Bảo mật thấp | IAM User quyền tối thiểu, chỉ `describe-instances` |

---

#### 📁 Script `start-dev.ps1` — Khi implement sẽ làm

```
start-dev.ps1
  ├─ Bước 1: aws ec2 describe-instances → lấy PublicIpAddress
  ├─ Bước 2: Ghi vào C:\Users\qngo6\.ssh\config (HostName)
  ├─ Bước 3: Mã hóa IP + gọi GitHub API cập nhật secret EC2_HOST
  ├─ Bước 4: In thông báo "✅ Sẵn sàng — IP: xx.xx.xx.xx"
  └─ Bước 5 (optional): Mở browser http://<IP_MỚI>
```

**Cần chuẩn bị trước khi implement script:**
- [ ] Lấy **Instance ID** từ AWS Console (dạng `i-0abc1234567890def`)
- [ ] Tạo **IAM User** với policy `ec2:DescribeInstances` → lấy Access Key
- [ ] Chạy `aws configure` trên máy Windows (nhập Access Key + Secret Key + region `ap-southeast-1`)
- [ ] Tạo **GitHub PAT** với quyền update secrets → lưu vào script

---

## 3. 📋 Checklist thực hiện

### Trên EC2 ✅ HOÀN THÀNH
- [x] ✅ Chạy `setup-ec2.sh` — PostgreSQL 16.13 cài xong, DB `nhadanshop` tạo xong
- [x] ✅ PostgreSQL chỉ nghe `127.0.0.1:5432` — không expose ra internet
- [x] ✅ Deploy JAR — Spring Boot chạy, Flyway V1+V2+V3 migrate xong
- [x] ✅ Deploy Frontend — React app tại `/var/www/nhadanshop/`
- [x] ✅ **RDS đã xóa** — không còn tốn phí

### GitHub Actions
- [ ] 🔲 Cập nhật secret `DB_PASSWORD = NhaDanShop@2026!`
- [ ] 🔲 Cập nhật secret `EC2_HOST = <IP_MỚI_SAU_KHI_CHẠY_SCRIPT>`
- [ ] 🔲 Xóa secret `RDS_PASSWORD` (nếu còn)
- [ ] 🔲 Push code → verify pipeline

### Fix IP tự động (Giải pháp B — chưa implement)
- [ ] 🔲 Lấy **Instance ID** từ AWS Console
- [ ] 🔲 Tạo **IAM User** quyền `ec2:DescribeInstances`
- [ ] 🔲 Cài **AWS CLI** + `aws configure`
- [ ] 🔲 Tạo **GitHub PAT** quyền update secrets
- [ ] 🔲 Implement `start-dev.ps1`

### Quy trình hàng ngày (sau khi có script)
```
Buổi tối:   AWS Console → Stop EC2   (~tiết kiệm $0.01/giờ)
Buổi sáng:  AWS Console → Start EC2
            → Chạy: .\start-dev.ps1
            → SSH + deploy bình thường với IP mới
```

---

## 3. 🚀 Thực hiện — 3 bước đơn giản

### Bước 1 — Chạy setup-ec2.sh trên EC2

```bash
# SSH vào EC2
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>

# Upload script
scp -i your-key.pem setup-ec2.sh ubuntu@<EC2_PUBLIC_IP>:~

# Chạy với password tùy chọn
export DB_PASSWORD="YourStrong@Password2026!"
sudo -E ./setup-ec2.sh
```

Script sẽ tự động:
- Cài Java 21 + PostgreSQL 16 + Nginx
- Tạo database `nhadanshop` **mới hoàn toàn** (empty)
- Tạo user `nhadanshop_user` với password bạn chọn
- Cấu hình systemd service + backup cron
- **Flyway sẽ tự tạo toàn bộ tables khi app khởi động lần đầu**

### Bước 2 — Stop/Delete RDS trên AWS Console

```
AWS Console → RDS → Databases → nhadanshop-db
  → Actions → Stop (để giữ 7 ngày) hoặc Delete (xóa hẳn)
```

> ⚠️ Nên **Stop** trước, chờ verify app chạy ổn 1-2 ngày, rồi mới **Delete**.

### Bước 3 — Cập nhật GitHub Secrets + Push

```
GitHub → Repo → Settings → Secrets → Actions:

THÊM / SỬA:
  DB_PASSWORD  = YourStrong@Password2026!

XÓA:
  RDS_PASSWORD       (nếu có)
  VITE_API_BASE_URL  (nếu có — để trống là đúng)

GIỮ NGUYÊN:
  EC2_SSH_KEY
  EC2_HOST
```

```bash
# Trigger deploy
git commit --allow-empty -m "chore: migrate to EC2 PostgreSQL"
git push origin main
```

---

## 4. 🔒 Bảo mật — AWS Security Group

Vào **AWS Console → EC2 → Security Groups**, đảm bảo:

| Port | Source | Trạng thái |
|---|---|---|
| 22 (SSH) | Your IP only | ✅ Mở |
| 80 (HTTP) | 0.0.0.0/0 | ✅ Mở |
| 443 (HTTPS) | 0.0.0.0/0 | ✅ Mở (nếu có SSL) |
| **5432 (PostgreSQL)** | **Không mở** | ✅ Đóng hoàn toàn |
| 8080 (Spring Boot) | Không mở | ✅ Đóng (Nginx proxy) |

```bash
# Verify PostgreSQL chỉ listen localhost
sudo -u postgres psql -c "SHOW listen_addresses;"
# Kết quả mong muốn: localhost
```

---

## 5. ✅ Verify sau khi deploy

```bash
# SSH vào EC2
ssh -i your-key.pem ubuntu@<EC2_IP>

# 1. Kiểm tra PostgreSQL
sudo systemctl status postgresql
PGPASSWORD="YourStrong@Password2026!" psql -h localhost -U nhadanshop_user -d nhadanshop -c "\dt"
# → Phải thấy danh sách tables (do Flyway tạo)

# 2. Kiểm tra Spring Boot
sudo systemctl status nhadanshop
curl http://localhost:8080/actuator/health
# → {"status":"UP"}

# 3. Kiểm tra qua Nginx
curl http://localhost/api/actuator/health
# → {"status":"UP"}

# 4. Kiểm tra từ ngoài
curl http://<EC2_PUBLIC_IP>/api/actuator/health
# → {"status":"UP"}
```

---

## 6. ⚙️ Files cần thay đổi

### Files trong repo (đã cập nhật)
```
.github/workflows/deploy.yml    ✅ Đã sửa — dùng localhost:5432, secret DB_PASSWORD
setup-ec2.sh                    ✅ Đã sửa — 8 bước, PG16 official repo, backup cron
```

### Cấu hình systemd trên EC2 (deploy.yml tự động ghi)
```ini
Environment="SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5432/nhadanshop"
Environment="SPRING_DATASOURCE_USERNAME=nhadanshop_user"
Environment="SPRING_DATASOURCE_PASSWORD=<DB_PASSWORD secret>"
```

### Files KHÔNG cần sửa
```
application.properties          ← Giữ nguyên (dùng localhost:5432 cho local dev)
docker-compose.yml              ← Giữ nguyên (local dev)
NhaDanShopUi/.env.production    ← Giữ nguyên (VITE_API_BASE_URL trống)
NhaDanShopUi/vite.config.js     ← Giữ nguyên
```

---

## 7. 🔄 Quy trình deploy sau khi migrate

```
git push origin main
        ↓
GitHub Actions trigger
        ↓
  Job 1: Build JAR  (~2 phút)
  Job 2: Build dist (~1 phút)  ← song song
        ↓
  Job 3: Deploy
    ├─ SCP nhadanshop.jar → EC2:/app/nhadanshop/
    ├─ systemctl restart nhadanshop
    │    └─ Spring Boot khởi động
    │    └─ Flyway auto-migrate (nếu có V3, V4...)
    │    └─ Kết nối localhost:5432 ✅
    ├─ rsync dist/ → /var/www/nhadanshop/
    ├─ nginx reload
    └─ Health check → 200 OK ✅
        ↓
  ✅ Done (~5 phút tổng)
```

---

## 8. 🆘 Troubleshooting

### PostgreSQL không start
```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql -n 30 --no-pager
sudo ss -tlnp | grep 5432
```

### Spring Boot lỗi kết nối DB
```bash
sudo journalctl -u nhadanshop -n 50 --no-pager
# Test thủ công
PGPASSWORD="YourStrong@Password2026!" \
  psql -h localhost -U nhadanshop_user -d nhadanshop -c "SELECT 1"
```

### Flyway lỗi migration
```bash
# Xem lịch sử migration
PGPASSWORD="..." psql -h localhost -U nhadanshop_user -d nhadanshop \
  -c "SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;"
```

### Rollback JAR khi deploy lỗi
```bash
sudo cp /app/nhadanshop/nhadanshop.jar.bak /app/nhadanshop/nhadanshop.jar
sudo systemctl restart nhadanshop
```

### Disk đầy
```bash
df -h
du -sh /var/lib/postgresql/16/
sudo -u postgres psql -d nhadanshop -c "
  SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
  FROM pg_stat_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"
```
