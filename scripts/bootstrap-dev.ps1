# Sets up a district Windows PC for SpartBoard development. Safe to re-run; it skips what's already done.
# Run from the repo root: powershell -ExecutionPolicy Bypass -File scripts/bootstrap-dev.ps1

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }
function Ok($msg) { Write-Host "   ok  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "   !!  $msg" -ForegroundColor Yellow }

# Exit code of a native command with all its output discarded (5.1 throws on redirected stderr under Stop).
function Quiet-Exit([scriptblock]$block) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $block *> $null } finally { $ErrorActionPreference = $old }
  return $LASTEXITCODE
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user"
}

function Ensure-Tool($command, $wingetId, $label) {
  if (Get-Command $command -ErrorAction SilentlyContinue) {
    Ok "$label already installed"
    return
  }
  Write-Host "   installing $label..."
  winget install --id $wingetId -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Refresh-Path
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$label did not install. Install it by hand ($wingetId), open a new PowerShell window, and re-run this script."
  }
  Ok "$label installed"
}

Step 'Tools'
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  throw 'winget is missing. Install "App Installer" from the Microsoft Store, then re-run.'
}
Ensure-Tool git 'Git.Git' 'Git'
Ensure-Tool gh 'GitHub.cli' 'GitHub CLI'
Ensure-Tool node 'OpenJS.NodeJS.LTS' 'Node.js'
$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
  Write-Host "   upgrading Node $nodeMajor to the current LTS..."
  winget upgrade --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Refresh-Path
  $nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
  if ($nodeMajor -lt 24) { throw "Node 24+ is required (found $nodeMajor)." }
}
Ok "Node $(node --version)"
Ensure-Tool gcloud 'Google.CloudSDK' 'Google Cloud CLI'

Step 'pnpm'
$pkg = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$pnpmSpec = $pkg.packageManager  # e.g. pnpm@10.30.2
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  if ((Quiet-Exit { corepack enable }) -eq 0) {
    corepack prepare $pnpmSpec --activate
  } else {
    Warn 'corepack needs admin rights here; installing pnpm for this user instead.'
    npm install -g $pnpmSpec
  }
  Refresh-Path
}
Ok "pnpm $(pnpm --version)"

Step 'Git identity'
if (-not (git config --global user.email)) {
  $email = Read-Host '   Your district email'
  $name = Read-Host '   Your name'
  git config --global user.email $email
  git config --global user.name $name
}
Ok "$(git config --global user.name) <$(git config --global user.email)>"

Step 'GitHub sign-in'
if ((Quiet-Exit { gh auth status }) -ne 0) {
  gh auth login --web --git-protocol https
  gh auth setup-git
}
Ok "GitHub: $(gh api user --jq .login)"

Step 'Google Cloud sign-in (spartboard-dev only)'
if ((Quiet-Exit { gcloud auth application-default print-access-token }) -ne 0) {
  gcloud auth login
  gcloud auth application-default login
}
Quiet-Exit { gcloud config set project spartboard-dev } | Out-Null
Ok 'gcloud defaults to spartboard-dev'

Step 'Dependencies'
Push-Location $repoRoot
try {
  pnpm run install:all
  if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed.' }
} finally {
  Pop-Location
}
Ok 'installed'

Write-Host "`nAll set. Open this folder in the Claude desktop app (Code tab) and type /show-me." -ForegroundColor Green
Write-Host 'Read docs/ONBOARDING.md for how work gets from your computer to teachers.'
