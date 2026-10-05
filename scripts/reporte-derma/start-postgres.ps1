# DermaOps local DB helper (Windows)
# Starts PostgreSQL if installed at the default path.

$pgCtl = "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe"
$data = "C:\Program Files\PostgreSQL\17\data"

if (-not (Test-Path $pgCtl)) {
  Write-Host "PostgreSQL 17 not found. Install it or set DATABASE_URL to your Replit/external DB."
  exit 1
}

& $pgCtl status -D $data
if ($LASTEXITCODE -ne 0) {
  Write-Host "Starting PostgreSQL..."
  & $pgCtl start -D $data -l "$PSScriptRoot\pg.log"
}
