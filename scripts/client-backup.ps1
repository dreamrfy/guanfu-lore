# Client backup / restore / verify script (P1-T08 safety net).
# Operates on the emulator/device via adb. Usage (from Git Bash with env sourced):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/client-backup.ps1 -Cmd backup
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/client-backup.ps1 -Cmd restore -Name <folder>
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/client-backup.ps1 -Cmd verify -Name <folder>
param(
  [Parameter(Mandatory = $true)][string]$Cmd,
  [string]$Name = "",
  [string]$BackupRoot = "E:\dev\client-backups"
)
# adb writes progress to stderr; PS5.1 + Stop would kill the script on it. Use Continue + explicit checks.
$ErrorActionPreference = 'Continue'
$adb = 'E:\VBcoding\biyaaozhicheng\dev\android-sdk\platform-tools\adb.exe'
$remoteDir = '/data/data/com.lightledger.bijiapp/app_flutter'
$remoteDb = "$remoteDir/bijiapp.sqlite"
$remoteWal = "$remoteDb-wal"
$remoteAssets = "$remoteDir/assets"

function AdbRoot {
  & $adb root | Out-Null
  Start-Sleep -Seconds 2
}

function Get-PageCount([string]$dbPath) {
  # Count on a THROWAWAY COPY: opening+closing a WAL-mode db checkpoints it
  # (merges wal into db, deletes wal/shm) — never mutate backup artifacts.
  $tmp = Join-Path $env:TEMP ('cnt-' + [guid]::NewGuid().ToString('N') + '.sqlite')
  Copy-Item $dbPath $tmp -Force
  if (Test-Path "$dbPath-wal") { Copy-Item "$dbPath-wal" "$tmp-wal" -Force }
  $count = & python -c "import sqlite3,sys; con=sqlite3.connect(sys.argv[1]); print(con.execute('select count(*) from pages').fetchone()[0]); con.close()" $tmp 2>$null
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  Remove-Item "$tmp-wal" -Force -ErrorAction SilentlyContinue
  return [int]$count
}

function Get-AssetCount([string]$dbPath) {
  $tmp = Join-Path $env:TEMP ('cnt-' + [guid]::NewGuid().ToString('N') + '.sqlite')
  Copy-Item $dbPath $tmp -Force
  if (Test-Path "$dbPath-wal") { Copy-Item "$dbPath-wal" "$tmp-wal" -Force }
  $count = & python -c "import sqlite3,sys; con=sqlite3.connect(sys.argv[1]); print(con.execute('select count(*) from assets').fetchone()[0]); con.close()" $tmp 2>$null
  Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  Remove-Item "$tmp-wal" -Force -ErrorAction SilentlyContinue
  return [int]$count
}

if ($Cmd -eq 'backup') {
  if ($Name -eq '') { $Name = Get-Date -Format 'yyyyMMdd-HHmmss' }
  $dir = Join-Path $BackupRoot $Name
  if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  AdbRoot
  # Quiesce the app, then pack ONE tar on the device and pull that single file:
  # per-file pulls of a live SQLite db+wal pair are racy (checkpoint moves bytes between files).
  & $adb shell am force-stop com.lightledger.bijiapp 2>&1 | Out-Null
  Start-Sleep -Seconds 1
  & $adb shell "rm -f /data/local/tmp/bijiapp-backup.tar && tar -cf /data/local/tmp/bijiapp-backup.tar -C $remoteDir ." 2>&1 | Out-Null
  & $adb pull /data/local/tmp/bijiapp-backup.tar "$dir/backup.tar" 2>&1 | Out-Null
  if (-not (Test-Path "$dir/backup.tar")) { Write-Output "BACKUP_FAIL tar pull failed"; exit 1 }
  & $adb shell rm -f /data/local/tmp/bijiapp-backup.tar 2>&1 | Out-Null
  # Extract on the host with python (deterministic), keeping db/wal/shm at top level
  $extract = & python -c "import tarfile,sys; t=tarfile.open(sys.argv[1]); t.extractall(path=sys.argv[2], filter='data')" "$dir/backup.tar" "$dir/data" 2>&1
  if (-not (Test-Path "$dir/data/bijiapp.sqlite")) { Write-Output "BACKUP_FAIL extract failed: $extract"; exit 1 }
  Move-Item "$dir/data/bijiapp.sqlite" "$dir/bijiapp.sqlite" -Force
  foreach ($side in @('-wal', '-shm')) {
    if (Test-Path "$dir/data/bijiapp.sqlite$side") { Move-Item "$dir/data/bijiapp.sqlite$side" "$dir/bijiapp.sqlite$side" -Force }
  }
  if (Test-Path "$dir/data/assets") { Move-Item "$dir/data/assets" "$dir/assets" -Force }
  if (Test-Path "$dir/data/migration-demo") { Remove-Item -Recurse -Force "$dir/data/migration-demo" }
  # Bring the app back up
  & $adb shell am start -n com.lightledger.bijiapp/.MainActivity 2>&1 | Out-Null

  $files = @()
  Get-ChildItem -Path $dir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($dir.Length + 1).Replace('\', '/')
    $hash = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash.ToLower()
    $files += @{ path = $rel; size = $_.Length; sha256 = $hash }
  }
  $dbPath = Join-Path $dir 'bijiapp.sqlite'
  $manifest = @{
    createdAt = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    pages     = (Get-PageCount $dbPath)
    assets    = (Get-AssetCount $dbPath)
    files     = $files
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $dir 'manifest.json')
  Write-Output ("BACKUP_OK name=$Name pages=" + $manifest.pages + " assets=" + $manifest.assets + " files=" + $files.Count)
  exit 0
}

if ($Cmd -eq 'restore') {
  if ($Name -eq '') { $Name = (Get-ChildItem $BackupRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name }
  $dir = Join-Path $BackupRoot $Name
  if (-not (Test-Path $dir)) { Write-Output "RESTORE_FAIL backup not found: $Name"; exit 1 }
  AdbRoot
  & $adb shell am force-stop com.lightledger.bijiapp 2>$null | Out-Null
  & $adb push "$dir/bijiapp.sqlite" $remoteDb | Out-Null
  if (Test-Path "$dir/bijiapp.sqlite-wal") {
    & $adb push "$dir/bijiapp.sqlite-wal" $remoteWal | Out-Null
  } else {
    & $adb shell rm -f $remoteWal | Out-Null
  }
  if (Test-Path "$dir/assets") {
    Get-ChildItem "$dir/assets" -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring((Join-Path $dir 'assets').Length + 1).Replace('\', '/')
      $parent = $remoteAssets + '/' + ($rel -replace '/[^/]+$', '')
      & $adb shell mkdir -p $parent | Out-Null
      & $adb push $_.FullName "$remoteAssets/$rel" | Out-Null
    }
  }
  $dbLocal = Join-Path $env:TEMP 'bijiapp-restore-check.sqlite'
  Copy-Item "$dir/bijiapp.sqlite" $dbLocal -Force
  if (Test-Path "$dir/bijiapp.sqlite-wal") { Copy-Item "$dir/bijiapp.sqlite-wal" "$dbLocal-wal" -Force }
  Write-Output ("RESTORE_OK name=$Name pages=" + (Get-PageCount $dbLocal) + " assets=" + (Get-AssetCount $dbLocal))
  exit 0
}

if ($Cmd -eq 'verify') {
  if ($Name -eq '') { Write-Output 'VERIFY_FAIL name required'; exit 1 }
  $dir = Join-Path $BackupRoot $Name
  $manifestPath = Join-Path $dir 'manifest.json'
  if (-not (Test-Path $manifestPath)) { Write-Output 'VERIFY_FAIL manifest missing'; exit 1 }
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
  $bad = 0
  foreach ($f in $manifest.files) {
    $full = Join-Path $dir ($f.path -replace '/', '\')
    if (-not (Test-Path $full)) { Write-Output ("MISSING " + $f.path); $bad++; continue }
    $hash = (Get-FileHash -Algorithm SHA256 $full).Hash.ToLower()
    if ($hash -ne $f.sha256) { Write-Output ("HASH_MISMATCH " + $f.path); $bad++ }
  }
  if ($bad -eq 0) { Write-Output ("VERIFY_OK all " + $manifest.files.Count + " files intact, pages=" + $manifest.pages + " assets=" + $manifest.assets) }
  else { Write-Output "VERIFY_FAIL $bad problems"; exit 1 }
  exit 0
}

Write-Output "Unknown command: $Cmd (use backup|restore|verify)"
exit 1
