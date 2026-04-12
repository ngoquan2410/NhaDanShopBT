# ============================================================
# SETUP_START_DEV.md — Hướng dẫn setup start-dev.ps1
# Thực hiện 1 lần duy nhất
# ============================================================

## Trạng thái cài đặt
- [x] AWS CLI đã download: C:\Temp\AWSCLIV2.msi (45MB)
- [x] GitHub CLI đã download: C:\Temp\gh_cli.msi  
- [x] Instance ID: i-00f3b6c416b2f2777

## BƯỚC 1 — Cài AWS CLI (nếu chưa cài)
Mở CMD với quyền Admin, chạy:
```
msiexec /i C:\Temp\AWSCLIV2.msi /quiet
```
Verify: mở CMD mới → `aws --version`

## BƯỚC 2 — Cài GitHub CLI (nếu chưa cài)
```
msiexec /i C:\Temp\gh_cli.msi /quiet
```
Verify: mở CMD mới → `gh --version`

## BƯỚC 3 — Tạo IAM User trên AWS Console (Step by Step)

### 📍 Step 1 — Specify user details
```
User name: nhadanshop-script         ✅ đã nhập đúng
☐ Provide user access to the AWS Management Console  ← KHÔNG tick
   (User này chỉ dùng cho script/CLI, không cần đăng nhập web console)
```
→ Nhấn **Next**

---

### 📍 Step 2 — Set permissions

```
Chọn: "Attach policies directly"
         ↓
Không chọn policy nào trong list (list quá dài)
         ↓
Kéo xuống dưới cùng → nhấn "Create policy"  ← mở tab mới
```

**Trong tab "Create policy" mới mở:**
```
① Chọn tab "JSON"  (không dùng Visual editor)

② Xóa toàn bộ nội dung cũ, dán vào:
```
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:DescribeInstances"
      ],
      "Resource": "*"
    }
  ]
}
```
```
③ Nhấn "Next"
④ Policy name: nhadanshop-describe-ec2
⑤ Nhấn "Create policy"  ← tạo xong, đóng tab này lại
```

**Quay lại tab Step 2 — Set permissions:**
```
Nhấn nút refresh (icon ↻) cạnh ô tìm kiếm
Tìm: nhadanshop-describe-ec2
Tick ✅ vào policy vừa tạo
```
→ Nhấn **Next**

---

### 📍 Step 3 — Review and create
```
Kiểm tra:
  User name  : nhadanshop-script
  Permissions: nhadanshop-describe-ec2
```
→ Nhấn **Create user**

---

### 📍 Step 4 — Tạo Access Key cho user vừa tạo

```
IAM → Users → nhadanshop-script
  → Tab "Security credentials"
  → Mục "Access keys"
  → Nhấn "Create access key"
```

**Chọn use case:**
```
● Command Line Interface (CLI)   ← chọn cái này
☐ ...các option khác
```
Tick vào ô **"I understand the above recommendation..."** ở dưới
→ Nhấn **Next**

**Description tag** (tùy chọn):
```
Description: dung cho start-dev.ps1
```
→ Nhấn **Create access key**

---

### 📍 Step 5 — ⚠️ LƯU ACCESS KEY NGAY (chỉ hiện 1 lần!)

```
┌─────────────────────────────────────────────────┐
│  Access key ID:      AKIA...............         │  ← copy
│  Secret access key:  xxxxxxxxxxxxxxxxxxxxxxxx    │  ← copy (ẩn, nhấn Show)
└─────────────────────────────────────────────────┘
```

**Nhấn "Download .csv file"** để lưu file backup, sau đó **"Done"**

> ⚠️ Secret access key **KHÔNG hiện lại** sau khi đóng màn hình này!
> Nếu quên → phải xóa key cũ và tạo key mới.

## BƯỚC 4 — Configure AWS CLI
Mở CMD, chạy:
```
aws configure
```
Nhập:
```
AWS Access Key ID:     <Access Key từ bước 3>
AWS Secret Access Key: <Secret Key từ bước 3>  
Default region:        ap-southeast-1
Default output format: json
```

Verify:
```
aws ec2 describe-instances --instance-ids i-00f3b6c416b2f2777 --region ap-southeast-1 --query "Reservations[0].Instances[0].{IP:PublicIpAddress,State:State.Name}"
```
Kết quả mong muốn: `{ "IP": "47.129.188.27", "State": "running" }`

## BƯỚC 5 — Tạo GitHub Personal Access Token

1. Vào: https://github.com/settings/tokens/new
2. Tên: `nhadanshop-script`
3. Expiration: **No expiration** (hoặc 1 năm)
4. Scopes: tick **repo** (bao gồm secrets)
5. Generate token → copy token (ghp_xxxxxxxxxxxx)

## BƯỚC 6 — Điền vào start-dev.ps1

Mở file: `C:\Work\NhaDanShopBT\start-dev.ps1`

Sửa 2 dòng:
```powershell
GitHubOwner  = "REPLACE_WITH_GITHUB_USERNAME"  # → VD: "qngo6"
GitHubPAT    = "REPLACE_WITH_GITHUB_PAT"       # → "ghp_xxxxxxxxxxxx"
```

## BƯỚC 7 — Test chạy script

Mở PowerShell tại C:\Work\NhaDanShopBT:
```powershell
cd C:\Work\NhaDanShopBT
.\start-dev.ps1
```

Kết quả mong muốn:
```
[1/4] Kiểm tra AWS CLI...
    ✅ AWS CLI: aws-cli/2.x.x

[2/4] Lấy IP mới từ AWS...
    ✅ IP mới: 47.129.188.27  (state: running)

[3/4] Cập nhật SSH config...
    ✅ SSH config: 47.129.188.27 → 47.129.188.27

[4/4] Cập nhật GitHub Secret...
    ✅ GitHub Secret 'EC2_HOST' = 47.129.188.27

  ╔══════════════════════════════════╗
  ║   ✅ EC2 sẵn sàng!             ║
  ║   IP     : 47.129.188.27        ║
  ║   SSH    : ssh nhadanshop        ║
  ║   Deploy : git push origin main  ║
  ╚══════════════════════════════════╝
```

## Quy trình hàng ngày (sau khi setup xong)

```
Buổi tối:
  AWS Console → EC2 → Stop instance

Buổi sáng:  
  AWS Console → EC2 → Start instance
  Mở PowerShell:
    cd C:\Work\NhaDanShopBT
    .\start-dev.ps1
  → SSH và deploy như bình thường
```

## Shortcut Desktop (tiện hơn)

Tạo file `NhaDanShop-Start.bat` trên Desktop:
```batch
@echo off
powershell -ExecutionPolicy Bypass -File "C:\Work\NhaDanShopBT\start-dev.ps1" -OpenBrowser
pause
```
Double-click file này mỗi sáng là xong.
