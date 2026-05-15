# ============================================================
# dev-start.ps1 — Khởi động local dev environment
# Chạy: .\dev-start.ps1
# ============================================================

# dev-start.ps1 - Khoi dong moi truong dev local
# Dung: .\dev-start.ps1
# Yeu cau: Docker Desktop dang chay, Java 21, Node.js 20+

param(
    [switch]$SkipDocker,    # Bo qua khoi dong Docker Postgres
    [switch]$SkipBuild,     # Bo qua build JAR
    [switch]$SkipBackend,   # Chi chay Frontend
    [switch]$SkipFrontend   # Chi chay Backend
)

# --- Tu dong detect DB dang dung ---
# Neu PostgreSQL local dang chay tren port 5432 -> SkipDocker tu dong
$localPgRunning = (netstat -ano 2>$null | Select-String ":5432\s.*LISTEN")
if ($localPgRunning -and -not $SkipDocker) {
    Write-Host "  [AUTO] Phat hien PostgreSQL local dang chay -> bo qua Docker" -ForegroundColor DarkGray
    $SkipDocker = $true
}

Write-Host ""
Write-Host "  +========================================+" -ForegroundColor Cyan
Write-Host "  |   NhaDanShop - Local Dev Startup      |" -ForegroundColor Cyan
Write-Host "  +========================================+" -ForegroundColor Cyan
Write-Host ""

$ROOT   = $PSScriptRoot
$JAR    = "$ROOT\NhaDanShop\build\libs\NhaDanShop-0.0.1-SNAPSHOT.jar"
$UI_DIR = "$ROOT\nha-dan-pos-c091ee5b"

# -- BUOC 1: Tat tien trinh cu tren port 8080 va 5173 --
Write-Host "[0] Tat tien trinh cu (neu co)..." -ForegroundColor Yellow
@(8080, 5173) | ForEach-Object {
    $port = $_
    $pids = netstat -ano 2>$null | findstr ":$port " | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Where-Object { $_ -match '^\d+$' } | Sort-Object -Unique
    foreach ($p in $pids) {
        try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {}
    }
}
Start-Sleep -Seconds 1

# -- BUOC 2: Khoi dong PostgreSQL qua Docker --
if (-not $SkipDocker) {
    Write-Host "[1] Khoi dong PostgreSQL (Docker)..." -ForegroundColor Cyan
    $dockerOk = Get-Command docker -ErrorAction SilentlyContinue
    if (-not $dockerOk) {
        Write-Host "    WARN: Docker chua cai. Dung PostgreSQL local hoac them -SkipDocker" -ForegroundColor Yellow
    } else {
        docker compose -f "$ROOT\docker-compose.yml" up -d 2>&1 | Out-Null
        Write-Host "    OK: PostgreSQL dang chay tren localhost:5432" -ForegroundColor Green
        Write-Host "        DB=nhadanshop | User=postgres | Pass=P@ssword123" -ForegroundColor DarkGray
    }
} else {
    Write-Host "[1] Bo qua Docker (-SkipDocker)" -ForegroundColor DarkGray
}

# -- BUOC 3: Build JAR neu can --
if (-not $SkipBackend) {
    if ($SkipBuild) {
        Write-Host "[2] Bo qua build (-SkipBuild)" -ForegroundColor DarkGray
    } elseif (-not (Test-Path $JAR)) {
        Write-Host "[2] JAR chua co, dang build..." -ForegroundColor Cyan
        Push-Location "$ROOT\NhaDanShop"
        .\gradlew.bat bootJar -x test --quiet
        Pop-Location
        if (Test-Path $JAR) {
            Write-Host "    OK: Build thanh cong" -ForegroundColor Green
        } else {
            Write-Host "    FAIL: Build that bai! Chay: cd NhaDanShop; .\gradlew.bat bootJar" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[2] JAR da co, bo qua build (dung -SkipBuild de lam moi)" -ForegroundColor DarkGray
    }

    # -- BUOC 4: Khoi dong Spring Boot --
    Write-Host "[3] Khoi dong Spring Boot (port 8080)..." -ForegroundColor Cyan

    # Set env vars tu application-local.properties
    $localProps = "$ROOT\NhaDanShop\src\main\resources\application-local.properties"
    $envVars    = @{}
    if (Test-Path $localProps) {
        Get-Content $localProps | Where-Object { $_ -match '^[^#]+=.+' } | ForEach-Object {
            $parts = $_ -split '=', 2
            $envVars[$parts[0].Trim()] = $parts[1].Trim()
        }
    }

    # Build env string cho Java process
    function Get-Env($key, $default) { if ($envVars[$key]) { $envVars[$key] } else { $default } }

    $javaEnv = @(
        "DB_USERNAME=$(Get-Env 'DB_USERNAME' 'postgres')",
        "DB_PASSWORD=$(Get-Env 'DB_PASSWORD' 'P@ssword123')",
        "R2_ACCOUNT_ID=$(Get-Env 'R2_ACCOUNT_ID' '')",
        "R2_ACCESS_KEY_ID=$(Get-Env 'R2_ACCESS_KEY_ID' '')",
        "R2_SECRET_ACCESS_KEY=$(Get-Env 'R2_SECRET_ACCESS_KEY' '')",
        "R2_BUCKET_NAME=$(Get-Env 'R2_BUCKET_NAME' 'nhadanshop-images')",
        "R2_PUBLIC_URL=$(Get-Env 'R2_PUBLIC_URL' '')",
        "JWT_SECRET=$(Get-Env 'JWT_SECRET' 'dev-secret')"
    )

    # Set env vars truoc khi spawn Java
    foreach ($e in $javaEnv) {
        $k, $v = $e -split '=', 2
        [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
    }

    Start-Process -FilePath "java" `
        -ArgumentList "-jar `"$JAR`" --spring.profiles.active=default" `
        -WorkingDirectory "$ROOT\NhaDanShop" `
        -WindowStyle Minimized

    # Cho backend len
    Write-Host "    Cho Spring Boot khoi dong (~20s)..." -ForegroundColor DarkGray
    $timeout = 60; $elapsed = 0; $ready = $false
    while ($elapsed -lt $timeout) {
        Start-Sleep -Seconds 3; $elapsed += 3
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:8080/actuator/health" -TimeoutSec 2 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) { $ready = $true; break }
        } catch {}
        Write-Host "    ... ${elapsed}s" -ForegroundColor DarkGray
    }
    if ($ready) {
        Write-Host "    OK: Backend san sang tren http://localhost:8080" -ForegroundColor Green
    } else {
        Write-Host "    WARN: Backend chua san sang sau ${timeout}s - kiem tra log trong cua so Java" -ForegroundColor Yellow
    }
}

# -- BUOC 5: Khoi dong Vite dev server --
if (-not $SkipFrontend) {
    Write-Host "[4] Khoi dong Vite dev server (port 5173)..." -ForegroundColor Cyan
    if (-not (Test-Path "$UI_DIR\node_modules")) {
        Write-Host "    node_modules chua co, dang npm install..." -ForegroundColor Yellow
        Push-Location $UI_DIR
        npm install --silent
        Pop-Location
    }
    Start-Process -FilePath "cmd" `
        -ArgumentList "/k cd /d `"$UI_DIR`" && npm run dev" `
        -WindowStyle Normal
    Start-Sleep -Seconds 4
    Write-Host "    OK: Frontend san sang" -ForegroundColor Green
}

# -- Tom tat --
Write-Host ""
Write-Host "  +========================================+" -ForegroundColor Green
Write-Host "  |   OK Dev environment san sang!        |" -ForegroundColor Green
Write-Host "  +========================================+" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend  :  http://localhost:5173" -ForegroundColor White
Write-Host "  Backend   :  http://localhost:8080" -ForegroundColor White
Write-Host "  Health    :  http://localhost:8080/actuator/health" -ForegroundColor DarkGray
Write-Host "  DB        :  localhost:5432 | nhadanshop | postgres / P@ssword123" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Request flow:" -ForegroundColor Gray
Write-Host "  Browser -> localhost:5173/api/* -> Vite proxy -> localhost:8080" -ForegroundColor Gray
Write-Host ""
Write-Host "  LUON mo http://localhost:5173 (KHONG phai 8080)" -ForegroundColor Yellow
Write-Host ""
