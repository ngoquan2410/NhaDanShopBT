---
name: prod-db-backup-dryrun
overview: "Plan hoàn chỉnh để agent khác: backup PostgreSQL production trên EC2 (PG16) về `C:\\Keys\\backups`, restore vào DB dry-run cục bộ (PG14 hoặc fallback PG16), chạy Flyway V5–V37 qua Spring Boot trỏ vào DB đó, validate schema/dữ liệu, báo cáo pass/fail — không ghi production, không migration production, không downtime."
todos:
  - id: preflight
    content: "Chạy preflight: SSH, pg_dump/psql EC2, psql local, C:\\Keys\\backups, git status"
    status: completed
  - id: backup-scp
    content: Timestamp dir; COUNT(*) prod → prod_exact_row_counts; pg_dump EC2 /tmp; chown/chmod ubuntu; scp; SHA256SUMS.txt; dọn /tmp
    status: completed
  - id: restore-local
    content: PGPASSWORD; CREATE DATABASE dry-run; restore .sql then .dump; nếu fail nhanh → Docker PG16 hoặc EC2 clone (chỉ sau approve)
    status: completed
  - id: flyway-bootrun
    content: SPRING_DATASOURCE_* + bootRun log/timeout 120s; Stop-Process gradlew + cleanup Gradle/Java child (Win32_Process), verify không orphan; V37 + Hibernate validate
    status: completed
  - id: validate-sql
    content: SQL mục 6; so row counts với prod_exact_row_counts_$tsFile.txt (COUNT(*) production)
    status: completed
  - id: report
    content: Báo cáo PASS/FAIL với classification (7.0), stage, evidence/log path, next action; forward-only nếu MIGRATION_FAIL; không đụng production
    status: completed
isProject: false
---

# Production DB backup và Flyway dry-run (local) tới V37

**Target artifact path (sau khi approve, lưu bản Markdown vào repo):** [.cursor/plans/prod-db-backup-dryrun-migration-plan.md](.cursor/plans/prod-db-backup-dryrun-migration-plan.md)

---

## 1. Summary

- **Task làm gì:** SSH read-only tới EC2, dùng `pg_dump` **PostgreSQL 16** trên server để dump DB `nhadanshop`, tải về `C:\Keys\backups\...` kèm `SHA256SUMS.txt`; chụp **COUNT(\*)** chính xác trên production vào `prod_exact_row_counts_*.txt`; tạo DB PostgreSQL **local** tên cô lập `nhadanshop_dryrun_YYYYMMDD_HHMMSS`; restore dump; chạy backend [NhaDanShop](NhaDanShop) với datasource trỏ DB dry-run để Flyway áp dụng **V5 → V37** và Hibernate `validate` pass; chạy SQL kiểm tra; xuất báo cáo pass/fail và rủi ro.
- **Không làm gì:** Không `INSERT/UPDATE/DELETE/DDL` trên production; không `flyway migrate`/Boot production; không restart app production; không đọc/ghi file bí mật không cần thiết (ví dụ `C:\Keys\AWS_Secret.txt`); không commit dump/checksum vào git; **không sửa** các file migration cũ (`V1`…`V37`) nếu dry-run fail — chỉ đề xuất migration **forward-only** mới (ví dụ `V38__...`) hoặc kế hoạch sửa dữ liệu trên bản sao local.
- **Trạng thái Flyway:** Production đã success tới **V4** (`flyway_schema_history` 4 dòng success). Repo có migration tới **[V37__performance_indexes_phase5b.sql](NhaDanShop/src/main/resources/db/migration/V37__performance_indexes_phase5b.sql)**. Dry-run mong đợi sau chạy: lịch sử gồm V1–V37, không có dòng `success = false`.

**Cấu hình backend liên quan (để agent không mơ hồ):** [application.properties](NhaDanShop/src/main/resources/application.properties): `spring.jpa.hibernate.ddl-auto=validate`, `spring.flyway.enabled=true`, `spring.flyway.locations=classpath:db/migration`, `spring.flyway.validate-on-migrate=false`. Flyway chạy trong tiến trình Spring; không có tác vụ Flyway Gradle riêng trong [build.gradle](NhaDanShop/build.gradle) ngoài dependency.

**Metadata số dòng production (đã từng quan sát):** Các con số kiểu `n_live_tup` từ `pg_stat_user_tables` (hoặc tương tự) chỉ là **ước lượng / metadata gần đúng**, không dùng làm nghiệm thu so khớp. Nghiệm thu so khớp row count bắt buộc dùng file **`prod_exact_row_counts_$tsFile.txt`** từ **`COUNT(*)`** trên production (mục 3.3) so với dry-run sau migrate (mục 6.5).

**Lưu ý phiên bản PG:** Production **16.13**, local service **14.9**. Dump nên tạo bằng **pg_dump 16 trên EC2**. Restore vào PG14: ưu tiên **plain SQL** (`-Fp`); định dạng custom (`-Fc`) từ PG16 thường cần **pg_restore 16+**. Nếu restore/migrate lỗi do mismatch: xem mục **7** (fallback nhanh, không debug vô hạn trên PG14).

**Mật khẩu PostgreSQL local (đã xác minh khớp default dev trong repo):** Dùng **`P@ssword123`** qua `$env:PGPASSWORD` và `$env:SPRING_DATASOURCE_PASSWORD` cho mọi `psql`/`pg_restore` local và `gradlew.bat bootRun`. Thư mục `C:\Keys\backups\...` chứa dump + log + checksum — coi như dữ liệu nhạy cảm, không commit.

**Optional repo scripts:** Nếu sau này muốn script PowerShell tái sử dụng trong repo, ghi rõ trong PR/task và **chỉ thêm sau khi approve** — plan này không bắt buộc tạo file trong repo.

---

## 2. Preflight checks

Thực hiện theo thứ tự; bất kỳ bước fail nào: dừng, ghi log, không tiếp tục backup.

| # | Kiểm tra | Pass criteria |
|---|-----------|-----------------|
| P1 | SSH tới EC2 | Kết nối thành công, không prompt host key conflict không mong muốn |
| P2 | Trên EC2: `/usr/bin/pg_dump --version`, `psql --version` | Major version **16.x** |
| P3 | Local: `$env:PGPASSWORD='P@ssword123'; & 'C:\Program Files\PostgreSQL\14\bin\psql.exe' -U postgres -c "SELECT version();"` | Service **14.x** đang chạy |
| P4 | Thư mục backup | `C:\Keys\backups` tồn tại và còn dung lượng (dump ~10 MB DB + overhead vẫn an toàn) |
| P5 | Backup **không** nằm dưới workspace git | Đường dẫn output chỉ dưới `C:\Keys\backups\...` |
| P6 | Git workspace | `git status` tại `C:\Work\NhaDanShopBT`: ghi nhận dirty/clean; tránh lẫn thay đổi code không liên quan vào báo cáo dry-run |

**SSH base (PowerShell):**

```powershell
ssh -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes ubuntu@13.214.207.226
```

**Đọc metadata production (read-only)** — xác nhận Flyway V4 và kích thước:

```powershell
ssh -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes ubuntu@13.214.207.226 "sudo -u postgres /usr/bin/psql -d nhadanshop -Atc \"SELECT version();\""
ssh -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes ubuntu@13.214.207.226 "sudo -u postgres /usr/bin/psql -d nhadanshop -c \"SELECT installed_rank, version, description, type, script, success FROM flyway_schema_history ORDER BY installed_rank;\""
ssh -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes ubuntu@13.214.207.226 "sudo -u postgres /usr/bin/psql -d nhadanshop -Atc \"SELECT COUNT(*) FROM flyway_schema_history WHERE success = false;\""
```

---

## 3. Backup procedure

### 3.1 Biến timestamp (PowerShell)

```powershell
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$tsFile = Get-Date -Format "yyyyMMdd_HHmmss"
$backupRoot = "C:\Keys\backups\nhadanshop-prod-$ts"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
```

### 3.2 Chiến lược file (tránh corrupt binary trên Windows PowerShell 5.x)

**Khuyến nghị chính:** tạo file dump **trên EC2** trong `/tmp`, đảm bảo **`ubuntu` đọc được để `scp`**, rồi **`scp` về local**. Tránh pipe trực tiếp `ssh ... pg_dump ... > file.dump` từ PowerShell 5.1 nếu không chắc encoding (plain SQL có thể ổn hơn với redirect UTF-8).

**Quyền file sau `pg_dump`:** File do `postgres` tạo trong `/tmp` mặc định **không** cho `ubuntu` đọc. Bắt buộc sau khi dump:

- `sudo chown ubuntu:ubuntu` hai file `.dump` và `.sql`
- `sudo chmod 600` hai file (chỉ owner đọc/ghi)

### 3.3 Snapshot COUNT(\*) chính xác trên production (read-only)

**Thời điểm:** Chạy **ngay trước** lệnh `pg_dump` trên EC2 (để sát thời điểm snapshot logic với nội dung dump nhất có thể). Chỉ `SELECT` / `COUNT(*)` — không ghi production.

Tạo file SQL query trên **local** (UTF-8), pipe vào `psql` trên EC2 qua SSH, ghi stdout vào **`$backupRoot\prod_exact_row_counts_$tsFile.txt`**:

**Nội dung file query (lưu ví dụ `$backupRoot\exact_row_counts_query.sql`):**

```sql
SELECT 'sales_invoice_items' AS table_name, COUNT(*) FROM sales_invoice_items
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_import_units', COUNT(*) FROM product_import_units
UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'inventory_receipt_items', COUNT(*) FROM inventory_receipt_items
UNION ALL SELECT 'product_batches', COUNT(*) FROM product_batches
UNION ALL SELECT 'sales_invoices', COUNT(*) FROM sales_invoices
UNION ALL SELECT 'inventory_receipts', COUNT(*) FROM inventory_receipts
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'flyway_schema_history', COUNT(*) FROM flyway_schema_history
ORDER BY table_name;
```

**PowerShell mẫu (expand `$backupRoot`, `$tsFile` trên local; query đi qua stdin tới `psql -f -` trên remote):**

```powershell
$sqlPath = Join-Path $backupRoot "exact_row_counts_query.sql"
@'
SELECT 'sales_invoice_items' AS table_name, COUNT(*) FROM sales_invoice_items
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_import_units', COUNT(*) FROM product_import_units
UNION ALL SELECT 'product_variants', COUNT(*) FROM product_variants
UNION ALL SELECT 'inventory_receipt_items', COUNT(*) FROM inventory_receipt_items
UNION ALL SELECT 'product_batches', COUNT(*) FROM product_batches
UNION ALL SELECT 'sales_invoices', COUNT(*) FROM sales_invoices
UNION ALL SELECT 'inventory_receipts', COUNT(*) FROM inventory_receipts
UNION ALL SELECT 'customers', COUNT(*) FROM customers
UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'user_roles', COUNT(*) FROM user_roles
UNION ALL SELECT 'roles', COUNT(*) FROM roles
UNION ALL SELECT 'refresh_tokens', COUNT(*) FROM refresh_tokens
UNION ALL SELECT 'flyway_schema_history', COUNT(*) FROM flyway_schema_history
ORDER BY table_name;
'@ | Set-Content -Path $sqlPath -Encoding utf8

Get-Content -Path $sqlPath -Raw | ssh -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes ubuntu@13.214.207.226 "sudo -u postgres /usr/bin/psql -d nhadanshop -v ON_ERROR_STOP=1 -f -" 2>&1 |
  Out-File -FilePath "$backupRoot\prod_exact_row_counts_$tsFile.txt" -Encoding utf8
```

**Pass criteria:** File `$backupRoot\prod_exact_row_counts_$tsFile.txt` tồn tại, có output bảng `table_name | count` (hoặc định dạng psql mặc định), không có lỗi `ERROR:` trong file.

### 3.4 Tạo dump trên EC2 + quyền `ubuntu` + `scp` về local

**Một lệnh SSH (remote):** `$tsFile` được **expand trên máy local** nhờ chuỗi PowerShell ngoài cùng dùng dấu nháy kép — remote nhận literal `20260515_143000` style.

```powershell
ssh -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes ubuntu@13.214.207.226 "sudo -u postgres bash -lc '/usr/bin/pg_dump -Fc -d nhadanshop -f /tmp/prod_nhadanshop_${tsFile}.dump && /usr/bin/pg_dump -Fp --no-owner --no-acl -d nhadanshop -f /tmp/prod_nhadanshop_${tsFile}.sql' && sudo chown ubuntu:ubuntu /tmp/prod_nhadanshop_${tsFile}.dump /tmp/prod_nhadanshop_${tsFile}.sql && sudo chmod 600 /tmp/prod_nhadanshop_${tsFile}.dump /tmp/prod_nhadanshop_${tsFile}.sql"
```

**Kéo file về:**

```powershell
scp -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes "ubuntu@13.214.207.226:/tmp/prod_nhadanshop_${tsFile}.dump" "$backupRoot\prod_nhadanshop_${tsFile}.dump"
scp -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes "ubuntu@13.214.207.226:/tmp/prod_nhadanshop_${tsFile}.sql" "$backupRoot\prod_nhadanshop_${tsFile}.sql"
```

**Dọn `/tmp` trên EC2 (tùy chọn, sau khi scp thành công):**

```powershell
ssh -i C:\Keys\nhadanshop-key.pem -o IdentitiesOnly=yes ubuntu@13.214.207.226 "rm -f /tmp/prod_nhadanshop_${tsFile}.dump /tmp/prod_nhadanshop_${tsFile}.sql"
```

Không cần password DB khi dùng `sudo -u postgres`.

### 3.5 Checksum SHA256 (local) — ghi **cố định** vào `SHA256SUMS.txt`

```powershell
Get-FileHash -Algorithm SHA256 "$backupRoot\prod_nhadanshop_${tsFile}.dump", "$backupRoot\prod_nhadanshop_${tsFile}.sql" |
  Format-Table -AutoSize |
  Out-File "$backupRoot\SHA256SUMS.txt" -Encoding utf8
```

**Pass criteria:** `$backupRoot\SHA256SUMS.txt` tồn tại, nội dung có **hai** dòng hash tương ứng hai file `prod_nhadanshop_${tsFile}.dump` và `prod_nhadanshop_${tsFile}.sql` (đường dẫn/Algorithm/Hash trình bày theo output `Format-Table`).

---

## 4. Local restore procedure

### 4.1 Mật khẩu client PostgreSQL local

Trước mọi lệnh `psql` / `pg_restore` local trong session:

```powershell
$env:PGPASSWORD = "P@ssword123"
```

### 4.2 Tên DB dry-run

```powershell
$dbName = "nhadanshop_dryrun_$tsFile"
```

Nếu `CREATE DATABASE` báo đã tồn tại: tăng suffix (ví dụ `_2`) — **không** `DROP DATABASE` trừ khi chắc chắn đó là DB dry-run cũ cùng session test.

### 4.3 Tạo database

```powershell
$env:PGPASSWORD = "P@ssword123"
& 'C:\Program Files\PostgreSQL\14\bin\psql.exe' -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE `"$dbName`";"
```

### 4.4 Restore — thứ tự thử

1. **Plain SQL** (khuyến nghị cho PG14 từ dump PG16 với schema đơn giản ~10 MB):

```powershell
$env:PGPASSWORD = "P@ssword123"
& 'C:\Program Files\PostgreSQL\14\bin\psql.exe' -U postgres -d $dbName -v ON_ERROR_STOP=1 -f "$backupRoot\prod_nhadanshop_${tsFile}.sql"
```

2. Nếu (1) lỗi cú pháp/tính năng PG16-only: thử **custom + pg_restore 14** (thường không khuyến nghị từ dump 16):

```powershell
$env:PGPASSWORD = "P@ssword123"
& 'C:\Program Files\PostgreSQL\14\bin\pg_restore.exe' -U postgres -d $dbName --no-owner --verbose "$backupRoot\prod_nhadanshop_${tsFile}.dump"
```

3. Nếu (1)(2) fail: **không** lặp vô hạn trên PG14 — ghi **nguyên văn stderr**, chuyển **fallback** theo mục **7** (Docker `postgres:16` hoặc clone EC2 **chỉ sau approve**).

### 4.5 Xác nhận restore = snapshot production

```powershell
$env:PGPASSWORD = "P@ssword123"
& 'C:\Program Files\PostgreSQL\14\bin\psql.exe' -U postgres -d $dbName -c "SELECT installed_rank, version, success FROM flyway_schema_history ORDER BY installed_rank;"
```

Kỳ vọng: 4 hàng, version cuối **4**, tất cả `success = t`. So `COUNT(*)` các bảng lõi với `prod_exact_row_counts_$tsFile.txt` (sau restore, **trước** Flyway V5+) — phải khớp; nếu không khớp: fail restore integrity trước khi migrate.

---

## 5. Migration dry-run procedure

### 5.1 Mục tiêu

Flyway áp dụng lần lượt script từ repo: **V5** (`V5__invoice_batch_allocations.sql`) … **V37** (`V37__performance_indexes_phase5b.sql`). Danh sách đầy đủ theo thứ tự version trong thư mục [db/migration](NhaDanShop/src/main/resources/db/migration): V5, V6, V7, V8, V9, V10, V11, V12, V13, V14, V15, V16, V17, V18, V19, V20, V21, V22, V23, V24, V25, V26, V27, V28, V29, V30, V31, V32, V33, V34, V35, V36, V37.

### 5.2 Chạy Spring Boot trỏ DB dry-run — **log file**, **timeout**, **dừng process rõ ràng**

`bootRun` là tiến trình **long-running**. Bắt buộc:

1. Gán đường dẫn log:

```powershell
$logPath = "$backupRoot\bootrun-dryrun_$tsFile.log"
$logErrPath = "$backupRoot\bootrun-dryrun_${tsFile}.err.log"
Remove-Item $logPath, $logErrPath -ErrorAction SilentlyContinue
```

2. Đặt biến môi trường (mật khẩu local đã xác minh):

```powershell
$env:PGPASSWORD = "P@ssword123"
$env:SPRING_DATASOURCE_URL = "jdbc:postgresql://localhost:5432/$dbName"
$env:SPRING_DATASOURCE_USERNAME = "postgres"
$env:SPRING_DATASOURCE_PASSWORD = "P@ssword123"
$env:MANAGEMENT_HEALTH_MAIL_ENABLED = "false"
```

3. Chạy Gradle **tách process** để có thể **Stop-Process** sau success hoặc sau timeout **120 giây**:

```powershell
Push-Location C:\Work\NhaDanShopBT\NhaDanShop
$gradle = Join-Path (Get-Location) "gradlew.bat"
$p = Start-Process -FilePath $gradle -ArgumentList @("bootRun", "--no-daemon") -PassThru -NoNewWindow `
  -RedirectStandardOutput $logPath -RedirectStandardError $logErrPath
$deadline = (Get-Date).AddSeconds(120)
while (-not $p.HasExited -and (Get-Date) -lt $deadline) {
  if ((Test-Path $logPath) -and (Select-String -Path $logPath -Pattern "Started NhaDanShopApplication" -Quiet)) { break }
  Start-Sleep -Seconds 2
}
$success = $false
if ((Test-Path $logPath) -and (Select-String -Path $logPath -Pattern "Started NhaDanShopApplication" -Quiet)) { $success = $true }
if (-not $p.HasExited) {
  Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
}
Pop-Location
```

4. **Pass:** `$success -eq $true`, log không chứa exception Flyway/Hibernate validate (đọc cả `$logPath` và `$logErrPath`).

5. **FAIL / timeout:** Sau 120 giây không thấy `Started NhaDanShopApplication`, hoặc log có lỗi Flyway/Hibernate — ghi **FAIL/timeout** (classification **`BOOTRUN_TIMEOUT`** hoặc lỗi trong log tương ứng mục **7**), đính kèm **tail** hai file log (ví dụ 200 dòng cuối). **Không** để session `bootRun` mở vô hạn.

6. **Cleanup process tree sau bootRun (Windows — bắt buộc):** `gradlew.bat bootRun` thường spawn **Gradle daemon / Java** con. `Stop-Process` chỉ lên PID của `gradlew.bat` **chưa đủ** để dừng toàn bộ cây tiến trình; JVM có thể còn chạy và giữ port/file.

   - **Sau success hoặc sau timeout**, agent phải **dọn** mọi tiến trình con **liên quan dry-run** còn sót (Gradle/Java) nếu vẫn chạy.
   - **Không** kill Java/Gradle không liên quan (dev khác, IDE, service khác).
   - **Ưu tiên nhận diện** qua `CommandLine` của process (WMI/CIM): chứa **`NhaDanShop`** hoặc **`NhaDanShopApplication`**, hoặc chứa working path project **`C:\Work\NhaDanShopBT\NhaDanShop`**, hoặc kết hợp **`gradlew.bat`** + **`bootRun`** / **`--no-daemon`** trong cùng một command line phù hợp session dry-run.
   - **Chỉ** sau khi đối chiếu thủ công `ProcessId`, `Name`, **full `CommandLine`** và chắc chắn đúng dry-run, mới `Stop-Process -Id <PID> -Force`.
   - Nếu **không chắc** process nào thuộc dry-run: **không kill bừa** — ghi báo cáo yêu cầu **cleanup thủ công**, kèm danh sách ứng viên (PID + command line) để người xử lý quyết định.

   **PowerShell gợi ý (bắt buộc xem `CommandLine` trước khi kill):**

   ```powershell
   $dryRunRoot = "C:\Work\NhaDanShopBT\NhaDanShop"
   Get-CimInstance Win32_Process |
     Where-Object {
       $_.CommandLine -and (
         $_.CommandLine -like "*$dryRunRoot*" -or
         $_.CommandLine -like "*NhaDanShopApplication*" -or
         ($_.CommandLine -like "*gradlew.bat*" -and $_.CommandLine -like "*bootRun*")
       )
     } |
     Select-Object ProcessId, Name, CommandLine
   ```

   Sau khi xác nhận từng PID đúng dry-run:

   ```powershell
   Stop-Process -Id <PID> -Force
   ```

7. **Xác minh sau cleanup:** Chạy lại block `Get-CimInstance` ở trên. **Pass cleanup:** không còn dòng nào khớp điều kiện dry-run (hoặc chỉ còn process đã được giải thích là ngoài phạm vi — phải ghi rõ trong báo cáo). Nếu vẫn còn ứng viên không rõ: classification ghi nhận + **next action** cleanup thủ công.

**Xác nhận bổ sung (nếu cần sau khi JVM đã dừng):** Chạy SQL mục **6.1** trên DB dry-run; nếu `latest_version = 37` và `failed_flyway_count = 0` nhưng log thiếu dòng Started do buffer — vẫn có thể PASS nếu Hibernate/Flyway đã ghi trong log; ngược lại coi là **cần điều tra**.

**Không** set biến môi trường trỏ production URL.

---

## 6. Validation queries (SQL chính xác — chạy sau migration)

Kết nối:

```powershell
$env:PGPASSWORD = "P@ssword123"
& 'C:\Program Files\PostgreSQL\14\bin\psql.exe' -U postgres -d $dbName -v ON_ERROR_STOP=1
```

**6.1 Flyway**

```sql
SELECT installed_rank, version, description, success, installed_on
FROM flyway_schema_history
ORDER BY installed_rank DESC
LIMIT 5;

SELECT version AS latest_version
FROM flyway_schema_history
WHERE success
ORDER BY installed_rank DESC
LIMIT 1;

SELECT COUNT(*) AS failed_flyway_count
FROM flyway_schema_history
WHERE success = false;
```

Pass: `latest_version = 37`, `failed_flyway_count = 0`.

**6.2 Bảng then chốt (tồn tại)**

```sql
SELECT to_regclass('public.payment_events') AS payment_events;
SELECT to_regclass('public.vouchers') AS vouchers;
SELECT to_regclass('public.loyalty_settings') AS loyalty_settings;
SELECT to_regclass('public.customer_point_transactions') AS customer_point_transactions;
SELECT to_regclass('public.promotion_buy_items') AS promotion_buy_items;
SELECT to_regclass('public.production_orders') AS production_orders;
```

Pass: tất cả **không null**.

**6.3 Cột then chốt**

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='product_batches' AND column_name='status';
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='product_variants' AND column_name='is_sellable';
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_invoices' AND column_name='pending_order_id';
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='sales_invoices' AND column_name='loyalty_discount_amount';
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='customers' AND column_name='point_balance';
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='promotions' AND column_name='repeatable';
```

**6.4 Chất lượng dữ liệu**

```sql
-- product_batches.status: khớp CHECK V18 (active|depleted|voided|blocked|archived)
SELECT status, COUNT(*) FROM product_batches GROUP BY status ORDER BY 1;
SELECT COUNT(*) AS invalid_batch_status
FROM product_batches
WHERE status NOT IN ('active','depleted','voided','blocked','archived');

-- Roles: schema dùng tiền tố ROLE_ (V1 seed ROLE_ADMIN/ROLE_USER; V36 thêm ROLE_STAFF, ROLE_CUSTOMER)
SELECT name FROM roles ORDER BY name;
SELECT COUNT(*) FILTER (WHERE name = 'ROLE_ADMIN') AS has_admin,
       COUNT(*) FILTER (WHERE name = 'ROLE_STAFF') AS has_staff,
       COUNT(*) FILTER (WHERE name = 'ROLE_CUSTOMER') AS has_customer
FROM roles;
```

Pass: `invalid_batch_status = 0`; `has_admin >= 1`; sau V36 `has_staff >= 1` và `has_customer >= 1`.

**6.5 Row counts bảng lõi — so với `prod_exact_row_counts_$tsFile.txt` (COUNT(\*) production)**

Chạy lại cùng query **COUNT(\*)** như mục **3.3** trên DB dry-run **sau migrate**, lưu ví dụ `$backupRoot\local_exact_row_counts_post_v37_$tsFile.txt`. So từng `table_name`: giá trị sau migrate phải **khớp** production snapshot **trừ khi** có migration forward cố ý thay đổi số dòng (hiếm); mọi delta phải có giải thích trong báo cáo — không giải thích được → **fail nghiệm thu**.

---

## 7. Failure handling

### 7.0 Phân loại kết quả bắt buộc (classification)

Báo cáo và xử lý lỗi **phải** gán đúng một trong các mã sau (để không nhầm lỗi restore môi trường với lỗi migration):

| Classification | Ý nghĩa |
|----------------|---------|
| **`PASS`** | Backup, restore (trên target DB đã chọn), migration Flyway, Hibernate validate, và validation SQL/row count theo plan đều pass. |
| **`BACKUP_FAIL`** | Không tạo được / không tải được backup production hợp lệ (SSH, `pg_dump`, `scp`, disk, quyền file trên EC2, v.v.). |
| **`RESTORE_ENV_MISMATCH`** | Backup production **hợp lệ** nhưng restore trên **PostgreSQL 14 local** fail chủ yếu do **version/syntax/tính năng không tương thích** giữa dump PG16 và engine PG14. Đây là lỗi **môi trường dry-run**, **chưa** được coi là lỗi migration. **Bắt buộc** thử **fallback PostgreSQL 16** (Docker hoặc path được approve) và lặp lại restore + mục 5–6 **trước khi** kết luận **`MIGRATION_FAIL`**. |
| **`RESTORE_DATA_FAIL`** | Restore fail vì **dump corrupt**, **thiếu quyền** local, **thiếu object** trong dump, checksum không khớp, **integrity dữ liệu** sau restore (ví dụ row count không khớp `prod_exact_row_counts_*.txt`), hoặc lỗi **không** gắn chủ yếu với mismatch phiên bản engine. |
| **`MIGRATION_FAIL`** | **Restore đã thành công** trên target DB dry-run (PG14 hoặc sau fallback PG16), nhưng **Flyway** fail tại version/script cụ thể. |
| **`HIBERNATE_VALIDATE_FAIL`** | Flyway đã chạy xong theo kỳ vọng, nhưng **Hibernate `ddl-auto=validate`** fail khi startup. |
| **`DATA_VALIDATION_FAIL`** | Flyway + startup không fail theo tiêu chí trên, nhưng **SQL validation** mục 6 hoặc **so khớp row count** với `prod_exact_row_counts_*.txt` fail. |
| **`BOOTRUN_TIMEOUT`** | `bootRun` không đạt trạng thái success trong **120 giây** (không thấy `Started NhaDanShopApplication` và không đủ bằng chứng thay thế), sau đó đã stop/cleanup theo mục **5.2**. |

**Quy tắc phân biệt:** Nếu restore trên **PG14** fail với dấu hiệu **version mismatch / syntax PG16-only / unsupported feature**, classification là **`RESTORE_ENV_MISMATCH`**, không phải **`MIGRATION_FAIL`**, cho đến khi đã thử **fallback PG16** (hoặc hết đường fallback được phép) và vẫn không restore được — khi đó có thể nâng cấp thành **`RESTORE_DATA_FAIL`** hoặc vẫn **`RESTORE_ENV_MISMATCH`** tùy evidence; **không** gán **`MIGRATION_FAIL`** nếu Flyway chưa từng chạy trên DB dry-run hợp lệ.

### 7.1 Xử lý theo giai đoạn

| Classification (ưu tiên gán) | Giai đoạn | Hành động |
|------------------------------|-----------|-----------|
| `BACKUP_FAIL` | Backup | Stop. Kiểm tra SSH key permission, disk EC2 `/tmp`, disk local, firewall, **quyền sau chown/chmod**. Không retry vô hạn làm tăng tải production. |
| `RESTORE_ENV_MISMATCH` / `RESTORE_DATA_FAIL` | Restore | Ghi **nguyên văn stderr** + classification. PG14: **không** debug lặp vô hạn. Thử định dạng còn lại (.sql ↔ .dump) **một vòng**. Nếu mismatch phiên bản → **`RESTORE_ENV_MISMATCH`**, chuyển **fallback PG16** theo thứ tự: **(1)** Docker `postgres:16` nếu Docker Desktop **đã bật**; restore lại, JDBC trỏ `localhost:<mapped_port>`, lặp mục 5–6. **(2)** Nếu Docker không khả dụng: đề xuất clone EC2, **xin approve** — **cấm** tự tạo DB trên EC2. |
| `MIGRATION_FAIL` | Flyway | Ghi **version**, **script**, **SQLSTATE/message**. **Không** sửa V1–V37. Đề xuất `V38__...sql` forward-only hoặc tiền xử lý dữ liệu trên **bản sao local**. |
| (thường đi kèm `MIGRATION_FAIL`) | V18 / constraint | Message voided receipt + `remaining_qty > 0`: đề xuất stock adjustment rồi migration mới — không sửa migration cũ. |
| `HIBERNATE_VALIDATE_FAIL` | Hibernate | So sánh entity JPA vs DB; ghi entity/column lỗi. |
| `BOOTRUN_TIMEOUT` | bootRun | Đính kèm tail log; kiểm tra DB URL, password, port; thực hiện **cleanup process tree** mục **5.2**; không để process treo. |
| `DATA_VALIDATION_FAIL` | Post-migrate SQL | Ghi query fail + delta row count; không gán `MIGRATION_FAIL` nếu Flyway history đã sạch — đây là drift/validation dữ liệu. |

---

## 8. Acceptance criteria (checklist)

- [ ] Thư mục `C:\Keys\backups\nhadanshop-prod-YYYYMMDD-HHMMSS` tồn tại với `.dump` + `.sql` (hoặc giải thích nếu chỉ một định dạng do policy).
- [ ] `$backupRoot\prod_exact_row_counts_$tsFile.txt` tồn tại (COUNT(\*) production trước dump).
- [ ] `$backupRoot\SHA256SUMS.txt` tồn tại, có hash cho **cả hai** file `prod_nhadanshop_${tsFile}.dump` và `prod_nhadanshop_${tsFile}.sql`.
- [ ] DB local dry-run tên cô lập, restore xong giống snapshot V4; row counts lõi khớp file exact production (trước Flyway tiếp).
- [ ] Sau dry-run bootRun (log + timeout): Flyway tới **version 37**, `failed_flyway_count = 0`.
- [ ] Hibernate validate pass (không lỗi trong log startup).
- [ ] **Cleanup bootRun (Windows):** Đã dừng Gradle/Java child liên quan dry-run theo mục **5.2**; xác minh lại không còn process khớp filter (hoặc báo cáo cleanup thủ công + PID/command line nếu không chắc).
- [ ] Báo cáo có: **`classification`** (mục **7.0**), **`stage`**, **`evidence`/`log path`**, **`next action`**; hash, đường dẫn file, tên DB, log path, tail log nếu fail, kết quả validation SQL, so row counts với `prod_exact_row_counts_*.txt`, rủi ro (PG14 vs PG16).
- [ ] Production: không thay đổi schema/data/app (xác nhận không chạy migrate prod).

---

## 9. Commands appendix (PowerShell, đường dẫn executable rõ ràng)

Tổng hợp: SSH test (mục 2); tạo `$backupRoot` (3.1); exact counts (3.3); dump + chown/chmod + scp (3.4); `SHA256SUMS.txt` (3.5); `$env:PGPASSWORD` + `CREATE DATABASE` / restore (mục 4); bootRun + log + timeout + **cleanup Win32_Process** (5.2); validation (mục 6); báo cáo **classification** (mục 7.0, 10).

**Cảnh báo bảo mật:** Không dán secret production hoặc nội dung file nhạy cảm không liên quan vào repo/chat công khai. File dưới `C:\Keys\backups\` (dump, log bootRun, checksum, row counts) coi như dữ liệu nhạy cảm. Mật khẩu local `P@ssword123` khớp default dev trong repo — nếu môi trường local đổi password, cập nhật lệnh cho khớp thực tế (và cập nhật lại plan nếu policy đổi).

---

## 10. Báo cáo kết quả (template bắt buộc cho agent)

Mỗi báo cáo **phải** có các trường sau (có thể dạng bảng Markdown hoặc heading rõ ràng):

- **`classification`:** Một trong: `PASS` | `BACKUP_FAIL` | `RESTORE_ENV_MISMATCH` | `RESTORE_DATA_FAIL` | `MIGRATION_FAIL` | `HIBERNATE_VALIDATE_FAIL` | `DATA_VALIDATION_FAIL` | `BOOTRUN_TIMEOUT` (định nghĩa mục **7.0**).
- **`stage`:** Giai đoạn fail cuối cùng hoặc `complete` nếu `PASS` (ví dụ `backup`, `restore_pg14`, `restore_pg16`, `flyway`, `hibernate`, `data_validation`, `bootrun`).
- **`evidence` / `log path`:** Đường dẫn file log (`$logPath`, `$logErrPath`), stderr restore, `SHA256SUMS.txt`, `prod_exact_row_counts_*.txt`, tail log khi fail, PID/command line nếu cleanup thủ công.
- **`next action`:** Bước cụ thể tiếp theo (ví dụ: bật Docker PG16 nếu `RESTORE_ENV_MISMATCH`; mở ticket `V38__...` nếu `MIGRATION_FAIL`; cleanup PID … nếu orphan process).

**Nội dung bổ sung theo giai đoạn:**

- **Backup:** đường dẫn + nội dung `SHA256SUMS.txt` (xác nhận 2 file).
- **prod_exact_row_counts:** đường dẫn file + tóm tắt.
- **Restore:** kết quả + stderr + PG14 vs fallback PG16; nếu PG14 fail do version mismatch → ghi rõ **`RESTORE_ENV_MISMATCH`** và xác nhận đã / chưa thử fallback PG16 trước khi mô tả bất kỳ kết luận migration.
- **bootRun:** `$logPath`, `$logErrPath`, timeout 120s, kết quả cleanup process tree (mục **5.2**).
- **Flyway / Hibernate / validation SQL:** tóm tắt; so khớp row counts với production exact.

**Rủi ro trước production migrate:** (ví dụ PG version, V18 data guard, thời gian chạy V37 indexes trên DB lớn hơn — hiện ~10 MB nên thấp).
