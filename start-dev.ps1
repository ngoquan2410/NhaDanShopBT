# ============================================================
# start-dev.ps1  -  Chay moi sang sau khi Start EC2
# 1. Lay IP moi tu AWS API (dung Instance ID co dinh)
# 2. Cap nhat SSH config  -> ssh nhadanshop hoat dong ngay
# 3. Cap nhat GitHub Secret EC2_HOST -> Actions deploy dung IP
# 4. (optional) Mo browser
#
# Dung: .\start-dev.ps1
#       .\start-dev.ps1 -SkipGitHub   (bo qua update secret)
#       .\start-dev.ps1 -OpenBrowser  (mo browser sau khi xong)
# ============================================================

param(
    [switch]$SkipGitHub,
    [switch]$OpenBrowser
)

$CONFIG = @{
    InstanceId    = "i-00f3b6c416b2f2777"
    AwsRegion     = "ap-southeast-1"
    AwsProfile    = "default"
    SshConfigPath = "C:\Users\$env:USERNAME\.ssh\config"
    SshKeyPath    = "C:\Keys\nhadanshop-key.pem"
    SshHost       = "nhadanshop"
    GitHubOwner   = "ngoquan2410"
    GitHubRepo    = "NhaDanShopBT"
    GitHubPAT     = if ($env:NHADANSHOP_GITHUB_PAT) { $env:NHADANSHOP_GITHUB_PAT } else { "REPLACE_WITH_GITHUB_PAT" }
    GitHubSecret  = "EC2_HOST"
}

# Load file local neu co (chua PAT thuc te, khong push len GitHub)
$localConfig = Join-Path $PSScriptRoot "start-dev.local.ps1"
if (Test-Path $localConfig) { . $localConfig }
# Sau khi load local config, override lai PAT neu co
if ($env:NHADANSHOP_GITHUB_PAT -and $CONFIG.GitHubPAT -eq "REPLACE_WITH_GITHUB_PAT") {
    $CONFIG.GitHubPAT = $env:NHADANSHOP_GITHUB_PAT
}

$ErrorActionPreference = "Stop"

function Write-Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    OK: $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    WARN: $msg" -ForegroundColor Yellow }
function Write-Fail($msg) { Write-Host "    FAIL: $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "  +--------------------------------------+" -ForegroundColor DarkCyan
Write-Host "  |   NhaDanShop - Start Dev Session    |" -ForegroundColor DarkCyan
Write-Host "  +--------------------------------------+" -ForegroundColor DarkCyan

$configErrors = @()
if ($CONFIG.InstanceId -like "*REPLACE*")  { $configErrors += "InstanceId chua set" }
if ($CONFIG.GitHubOwner -like "*REPLACE*") { $configErrors += "GitHubOwner chua set - VD: qngo6" }
if (-not $SkipGitHub -and $CONFIG.GitHubPAT -like "*REPLACE*") {
    $configErrors += "GitHubPAT chua set - Tao tai: https://github.com/settings/tokens"
}
if ($configErrors.Count -gt 0) {
    Write-Host ""
    Write-Host "  == CAN CAU HINH TRUOC ==" -ForegroundColor Red
    $configErrors | ForEach-Object { Write-Host "  * $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "  Mo file: notepad C:\Work\NhaDanShopBT\start-dev.ps1" -ForegroundColor Gray
    exit 1
}

# -- BUOC 1: Tim AWS CLI ------------------------------------------------------
Write-Step "1/4" "Kiem tra AWS CLI..."

$awsExe = @(
    "C:\Program Files\Amazon\AWSCLIV2\aws.exe",
    "C:\Program Files (x86)\Amazon\AWSCLIV2\aws.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $awsExe) {
    $awsCmd = Get-Command aws -ErrorAction SilentlyContinue
    if ($awsCmd) { $awsExe = $awsCmd.Source }
}

if (-not $awsExe) {
    Write-Fail "AWS CLI chua cai!"
    Write-Host "  +-- Cai dat (mo CMD voi quyen Admin):" -ForegroundColor Yellow
    Write-Host "  |  msiexec /i C:\Temp\AWSCLIV2.msi" -ForegroundColor White
    Write-Host "  |  Sau khi cai xong, chay: aws configure" -ForegroundColor White
    Write-Host "  |    Access Key ID : (lay tu IAM User)" -ForegroundColor Gray
    Write-Host "  |    Secret Key    : (lay tu IAM User)" -ForegroundColor Gray
    Write-Host "  |    Region        : ap-southeast-1" -ForegroundColor Gray
    Write-Host "  |    Output format : json" -ForegroundColor Gray
    Write-Host "  +-------------------------------------" -ForegroundColor Yellow
    Write-Host "  Sau khi configure xong, chay lai script nay." -ForegroundColor Cyan
    exit 1
}

$awsVersion = & $awsExe --version 2>&1
Write-OK "AWS CLI: $awsVersion"

# -- BUOC 2: Lay IP moi tu AWS ------------------------------------------------
Write-Step "2/4" "Lay IP moi tu AWS (Instance: $($CONFIG.InstanceId))..."

try {
    $jsonResult = & $awsExe ec2 describe-instances `
        --instance-ids $CONFIG.InstanceId `
        --region       $CONFIG.AwsRegion `
        --profile      $CONFIG.AwsProfile `
        --query        "Reservations[0].Instances[0].{IP:PublicIpAddress,State:State.Name}" `
        --output json  2>&1

    if ($LASTEXITCODE -ne 0) { throw $jsonResult }

    $info  = $jsonResult | ConvertFrom-Json
    $newIP = $info.IP
    $state = $info.State

    if ($state -ne "running") {
        Write-Fail "EC2 dang '$state' - Start EC2 truoc roi chay lai!"
        Write-Host "  AWS Console -> EC2 -> Instances -> Start instance" -ForegroundColor Yellow
        exit 1
    }
    if (-not $newIP) { Write-Fail "Khong lay duoc Public IP"; exit 1 }

    Write-OK "IP moi: $newIP  (state: $state)"

} catch {
    Write-Fail "AWS API loi: $_"
    Write-Host "  1. Chay: aws configure  (credentials dung chua?)" -ForegroundColor White
    Write-Host "  2. IAM User co policy ec2:DescribeInstances khong?" -ForegroundColor White
    Write-Host "  3. Instance ID: $($CONFIG.InstanceId)" -ForegroundColor White
    exit 1
}

# -- BUOC 3: Cap nhat SSH config ----------------------------------------------
Write-Step "3/4" "Cap nhat SSH config..."

$sshDir = Split-Path $CONFIG.SshConfigPath
if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Force $sshDir | Out-Null }

if (-not (Test-Path $CONFIG.SshConfigPath)) {
    $sshBlock = "Host " + $CONFIG.SshHost + "`n    HostName " + $newIP + "`n    User ubuntu`n    IdentityFile " + $CONFIG.SshKeyPath + "`n    StrictHostKeyChecking no`n    ServerAliveInterval 60`n    ServerAliveCountMax 3"
    Set-Content $CONFIG.SshConfigPath -Encoding UTF8 -Value $sshBlock
    Write-OK "Tao SSH config moi"
} else {
    $content = Get-Content $CONFIG.SshConfigPath -Raw
    $oldIP   = if ($content -match "HostName (\d+\.\d+\.\d+\.\d+)") { $Matches[1] } else { "?" }
    if ($content -match ("Host\s+" + $CONFIG.SshHost)) {
        $updated = $content -replace "HostName \d+\.\d+\.\d+\.\d+", ("HostName " + $newIP)
        Set-Content $CONFIG.SshConfigPath $updated -Encoding UTF8
    } else {
        $sshBlock = "`nHost " + $CONFIG.SshHost + "`n    HostName " + $newIP + "`n    User ubuntu`n    IdentityFile " + $CONFIG.SshKeyPath + "`n    StrictHostKeyChecking no`n    ServerAliveInterval 60`n    ServerAliveCountMax 3"
        Add-Content $CONFIG.SshConfigPath -Encoding UTF8 -Value $sshBlock
    }
    Write-OK "SSH config: $oldIP -> $newIP"
}

# -- BUOC 4: Cap nhat GitHub Secret -------------------------------------------
if ($SkipGitHub) {
    Write-Step "4/4" "Bo qua GitHub Secret update (-SkipGitHub)"
} else {
    Write-Step "4/4" "Cap nhat GitHub Secret '$($CONFIG.GitHubSecret)'..."

    $ghCli = Get-Command gh -ErrorAction SilentlyContinue
    if ($ghCli) {
        try {
            $env:GH_TOKEN = $CONFIG.GitHubPAT
            echo $newIP | & $ghCli.Source secret set $CONFIG.GitHubSecret `
                --repo "$($CONFIG.GitHubOwner)/$($CONFIG.GitHubRepo)" 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-OK "GitHub Secret updated via gh CLI"
            } else { throw "gh CLI loi" }
        } catch {
            Write-Warn "gh CLI that bai, thu GitHub REST API..."
            $ghCli = $null
        }
    }

    if (-not $ghCli) {
        # Dung Python + PyNaCl (da cai san) de ma hoa va update secret
        $pyScript = @"
import sys, requests, base64, json
from nacl import public as nacl_public

pat   = sys.argv[1]
owner = sys.argv[2]
repo  = sys.argv[3]
name  = sys.argv[4]
value = sys.argv[5]

headers = {
    'Authorization': f'Bearer {pat}',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
}
r = requests.get(f'https://api.github.com/repos/{owner}/{repo}/actions/secrets/public-key', headers=headers)
pk = r.json()
pk_bytes = base64.b64decode(pk['key'])
box = nacl_public.SealedBox(nacl_public.PublicKey(pk_bytes))
encrypted = base64.b64encode(box.encrypt(value.encode())).decode()
body = json.dumps({'encrypted_value': encrypted, 'key_id': pk['key_id']})
resp = requests.put(
    f'https://api.github.com/repos/{owner}/{repo}/actions/secrets/{name}',
    headers={**headers, 'Content-Type': 'application/json'},
    data=body
)
if resp.status_code in (201, 204):
    print(f'OK: {name} = {value}')
else:
    print(f'FAIL: {resp.status_code} {resp.text}')
    sys.exit(1)
"@
        $pyFile = [System.IO.Path]::GetTempFileName() -replace '\.tmp$', '.py'
        $pyScript | Out-File -FilePath $pyFile -Encoding UTF8
        try {
            $result = python $pyFile `
                $CONFIG.GitHubPAT `
                $CONFIG.GitHubOwner `
                $CONFIG.GitHubRepo `
                $CONFIG.GitHubSecret `
                $newIP 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-OK "GitHub Secret '$($CONFIG.GitHubSecret)' = $newIP"
            } else {
                throw $result
            }
        } catch {
            Write-Warn "Tu dong update that bai - can update thu cong:"
            Write-Host ""
            Write-Host "  Mo link:  https://github.com/$($CONFIG.GitHubOwner)/$($CONFIG.GitHubRepo)/settings/secrets/actions" -ForegroundColor Cyan
            Write-Host "  Tim:      $($CONFIG.GitHubSecret)" -ForegroundColor White
            Write-Host "  Doi thanh: $newIP" -ForegroundColor Green
            Write-Host ""
            $newIP | Set-Clipboard
            Write-Host "  (IP da copy vao clipboard)" -ForegroundColor Gray
        } finally {
            Remove-Item $pyFile -ErrorAction SilentlyContinue
        }
    }
}

# -- Tom tat ------------------------------------------------------------------
Write-Host ""
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host "  |   OK EC2 san sang!                       |" -ForegroundColor Green
Write-Host "  |                                          |" -ForegroundColor Green
Write-Host "  |   IP     : $newIP" -ForegroundColor Green
Write-Host "  |   App    : http://$($newIP):8080" -ForegroundColor Green
Write-Host "  |   SSH    : ssh $($CONFIG.SshHost)" -ForegroundColor Green
Write-Host "  |   Deploy : git push origin main          |" -ForegroundColor Green
Write-Host "  +------------------------------------------+" -ForegroundColor Green
Write-Host ""

try { $newIP | Set-Clipboard; Write-Host "  IP da copy vao clipboard" -ForegroundColor Gray } catch {}

if ($OpenBrowser) { Start-Process "http://$($newIP):8080" }
