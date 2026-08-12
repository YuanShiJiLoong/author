param(
  [switch]$MobileOnlyHotfix
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")
$gitSafeDir = $repoRoot.Path
$workflowPath = Join-Path $repoRoot ".agent\workflows\release.md"

function Write-Section {
  param([string]$Message)
  Write-Host ""
  Write-Host "== $Message =="
}

Write-Section "Release preflight"

if (-not (Test-Path -LiteralPath $workflowPath -PathType Leaf)) {
  Write-Error "Release workflow not found: $workflowPath"
  exit 1
}

try {
  $gitRoot = (& git -c "safe.directory=$gitSafeDir" -C $repoRoot rev-parse --show-toplevel).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "git rev-parse failed with exit code $LASTEXITCODE"
  }
} catch {
  Write-Error "Not inside a git repository: $repoRoot"
  exit 1
}

if ((Resolve-Path $gitRoot).Path -ne $repoRoot.Path) {
  Write-Error "Unexpected git root: $gitRoot"
  exit 1
}

Write-Host "Release workflow found:"
Write-Host "  $workflowPath"
Write-Host ""
Write-Host "Required before any release action:"
Write-Host "  1. Read .agent\workflows\release.md from top to bottom."
Write-Host "  2. Follow its confirmation gates before committing, tagging, pushing, or triggering CI."
Write-Host "  3. If this is a mobile-only hotfix, state that explicitly and get confirmation before using the shortened path."
Write-Host ""
Write-Host "Suggested command:"
Write-Host "  Get-Content .agent\workflows\release.md"

Write-Section "Workflow discovery check"
$workflowFiles = @()
if (Get-Command rg -ErrorAction SilentlyContinue) {
  $workflowFiles = & rg --files -uu -g ".agent/workflows/*.md" $repoRoot
} else {
  $workflowFiles = Get-ChildItem -LiteralPath (Join-Path $repoRoot ".agent\workflows") -Filter "*.md" -File |
    ForEach-Object { $_.FullName }
}

if (-not $workflowFiles) {
  Write-Error "No workflow files were discovered. Hidden workflow discovery is broken."
  exit 1
}

$workflowFiles | ForEach-Object { Write-Host "  $_" }

Write-Section "Current release mode"
if ($MobileOnlyHotfix) {
  Write-Host "Mode: mobile-only hotfix"
  Write-Host "Do not update desktop release notes or tags unless the workflow and user confirmation require it."
} else {
  Write-Host "Mode: full release"
  Write-Host "The full release workflow requires safety checks, release notes/title updates, version updates, commit, tag, push, and CI verification."
}

Write-Section "Git status summary"
& git -c "safe.directory=$gitSafeDir" -C $repoRoot status --short --branch
if ($LASTEXITCODE -ne 0) {
  Write-Error "Unable to read git status for: $repoRoot"
  exit 1
}

Write-Host ""
Write-Host "Preflight complete. Continue only after the workflow has been read and the release mode is confirmed."
