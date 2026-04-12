# ============================================================
# dev-start.ps1 — Khởi động local dev environment
# Chạy: .\dev-start.ps1
# ============================================================

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  NhaDanShop — Local Dev Startup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# ── Kill tiến trình cũ nếu có ────────────────────────────────────────────────
$oldVite = netstat -ano | findstr ":5173" | Select-Object -First 1
if ($oldVite) {
    $pid = ($oldVite -split '\s+')[-1]
    Write-Host "[1/2] Dừng Vite cũ (PID $pid)..." -ForegroundColor Yellow
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

$oldJava = netstat -ano | findstr ":8080" | Select-Object -First 1
if ($oldJava) {
    $pid = ($oldJava -split '\s+')[-1]
    Write-Host "[1/2] Dừng Backend cũ (PID $pid)..." -ForegroundColor Yellow
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 1

# ── Start Spring Boot backend ─────────────────────────────────────────────────
$jarPath = "$PSScriptRoot\NhaDanShop\build\libs\NhaDanShop-0.0.1-SNAPSHOT.jar"
if (-not (Test-Path $jarPath)) {
    Write-Host ""
    Write-Host "❌ JAR chưa build! Chạy lệnh sau trước:" -ForegroundColor Red
    Write-Host "   cd NhaDanShop" -ForegroundColor Yellow
    Write-Host "   .\gradlew.bat bootJar -x test" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "[1/2] 🚀 Khởi động Spring Boot backend (port 8080)..." -ForegroundColor Green
Start-Process -FilePath "java" `
    -ArgumentList "-jar `"$jarPath`"" `
    -WorkingDirectory "$PSScriptRoot\NhaDanShop" `
    -WindowStyle Minimized

Write-Host "      Chờ backend khởi động (~20 giây)..." -ForegroundColor Gray

# Chờ port 8080 up
$timeout = 40
$elapsed = 0
do {
    Start-Sleep -Seconds 2
    $elapsed += 2
    $listening = netstat -ano | findstr ":8080 " | findstr "LISTEN"
    if ($listening) { break }
    Write-Host "      ... $elapsed s" -ForegroundColor DarkGray
} while ($elapsed -lt $timeout)

if ($listening) {
    Write-Host "      ✅ Backend đã lên port 8080" -ForegroundColor Green
} else {
    Write-Host "      ⚠️  Backend chưa lên sau $timeout giây, tiếp tục..." -ForegroundColor Yellow
}

# ── Start Vite dev server ─────────────────────────────────────────────────────
Write-Host "[2/2] 🌐 Khởi động Vite dev server (port 5173)..." -ForegroundColor Green
$uiPath = "$PSScriptRoot\NhaDanShopUi"

Start-Process -FilePath "cmd" `
    -ArgumentList "/k cd /d `"$uiPath`" && npm run dev" `
    -WindowStyle Normal

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  ✅ Dev environment đã sẵn sàng!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  🌐 Frontend:  http://localhost:5173" -ForegroundColor White
Write-Host "  ⚙️  Backend:   http://localhost:8080" -ForegroundColor White
Write-Host ""
Write-Host "  Request flow:" -ForegroundColor Gray
Write-Host "  Browser → localhost:5173/api/* → Vite proxy → localhost:8080" -ForegroundColor Gray
Write-Host ""
Write-Host "  ⚠️  QUAN TRỌNG: Luôn mở http://localhost:5173 (KHÔNG phải 8080)" -ForegroundColor Yellow
Write-Host ""
