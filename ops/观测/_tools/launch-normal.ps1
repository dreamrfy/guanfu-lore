$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# 关掉现有 FlowUs（先礼后兵），再用调试端口重启，便于 CDP 读 DOM / 截图
Get-Process FlowUs -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 3
Get-Process FlowUs -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$exe = 'D:\软件\常用软件类\笔记\FlowUs\FlowUs.exe'
if (-not (Test-Path $exe)) { Write-Output "exe-not-found: $exe"; exit 1 }
Start-Process -FilePath $exe -ArgumentList # 普通启动（无调试端口）
Start-Sleep -Seconds 10

$count = (Get-Process FlowUs -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Output "processes=$count"
try {
  $r = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:9222/json/version' -TimeoutSec 5
  Write-Output "cdp-ok: $($r.Content)"
} catch {
  Write-Output "cdp-fail: $($_.Exception.Message)"
}