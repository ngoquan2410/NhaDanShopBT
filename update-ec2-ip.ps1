# update-ec2-ip.ps1 — Ch?y khi EC2 d?i IP
# Dùng: .\update-ec2-ip.ps1 <NEW_IP>
param([string]$NewIP)
if (-not $NewIP) {
    Write-Host "Usage: .\update-ec2-ip.ps1 <NEW_IP>" -ForegroundColor Yellow
    Write-Host "Example: .\update-ec2-ip.ps1 47.129.188.27" -ForegroundColor Yellow
    exit 1
}
$configPath = "C:\Users\qngo6\.ssh\config"
$content = Get-Content $configPath -Raw
$updated = $content -replace "HostName \d+\.\d+\.\d+\.\d+", "HostName $NewIP"
Set-Content $configPath $updated
Write-Host "? SSH config updated: HostName = $NewIP" -ForegroundColor Green
Write-Host ""
Write-Host "Ti?p theo:" -ForegroundColor Cyan
Write-Host "1. Test SSH: ssh nhadanshop 'echo OK'" -ForegroundColor White
Write-Host "2. C?p nh?t GitHub Secret EC2_HOST = $NewIP" -ForegroundColor White
