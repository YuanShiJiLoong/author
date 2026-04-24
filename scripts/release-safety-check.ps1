$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $repoRoot

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message) | Out-Null
}

function Add-Warning {
    param([string]$Message)
    $warnings.Add($Message) | Out-Null
}

function Require-Lines {
    param(
        [string]$Path,
        [string[]]$RequiredLines
    )

    if (-not (Test-Path $Path)) {
        Add-Failure "$Path is missing."
        return
    }

    $lines = Get-Content $Path |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -and -not $_.StartsWith('#') }

    foreach ($line in $RequiredLines) {
        if ($lines -notcontains $line) {
            Add-Failure "$Path does not contain required rule: $line"
        }
    }
}

function Match-GitOutput {
    param(
        [string[]]$GitArgs,
        [string]$Pattern
    )

    $output = & git @GitArgs
    return @($output | Select-String -Pattern $Pattern -CaseSensitive:$false)
}

function Get-CurrentDiffLines {
    param([object[]]$Lines)

    return @($Lines | Where-Object {
        -not ([string]$_).StartsWith('-')
    })
}

Write-Host '== Author release safety check =='
Write-Host "Repository: $repoRoot"
Write-Host 'Automated guardrail only. Manual semantic privacy review is still required before release.'
Write-Host ''

Require-Lines '.gitignore' @(
    '.env*',
    '/docs/',
    '/mobile',
    '*.dart',
    'mcp_config.json',
    '*.key',
    '*.pem',
    'home_screen.html',
    'stitch*'
)

Require-Lines '.dockerignore' @(
    '.agent',
    'docs',
    'mobile',
    '方案*',
    '计划*',
    '*草稿*',
    '*draft*',
    'mcp_config.json',
    '*.key',
    '*.pem',
    'home_screen.html',
    'stitch*'
)

$trackedMobilePattern = '\.dart|mobile|flutter|home_screen|pubspec\.yaml|podfile|stitch'
$trackedMobile = Match-GitOutput @('ls-files') $trackedMobilePattern
if ($trackedMobile.Count -gt 0) {
    Add-Failure "Tracked mobile/private assets found:`n$($trackedMobile -join "`n")"
}

$stagedMobile = Match-GitOutput @('diff', '--cached', '--name-only') $trackedMobilePattern
if ($stagedMobile.Count -gt 0) {
    Add-Failure "Staged mobile/private assets found:`n$($stagedMobile -join "`n")"
}

$trackedDocs = @(& git ls-files docs)
if ($trackedDocs.Count -gt 0) {
    Add-Failure "Tracked docs/ files found:`n$($trackedDocs -join "`n")"
}

$sensitiveTrackedPattern = 'secret|credential|key\.pem|env\.local|plan|\u65b9\u6848|\u8ba1\u5212|\u8349\u7a3f|draft|private|internal|debug\.log'
$sensitiveTracked = Match-GitOutput @('ls-files') $sensitiveTrackedPattern
if ($sensitiveTracked.Count -gt 0) {
    Add-Warning "Tracked files matched the sensitive-name review pattern:`n$($sensitiveTracked -join "`n")"
}

$diffOutput = @(& git diff -- . ':(exclude)package-lock.json' ':(exclude)scripts/release-safety-check.ps1')
$stagedDiffOutput = @(& git diff --cached -- . ':(exclude)package-lock.json' ':(exclude)scripts/release-safety-check.ps1')
$allDiffOutput = Get-CurrentDiffLines (@($diffOutput) + @($stagedDiffOutput))

$highConfidenceSecretPattern = 'sk-[A-Za-z0-9_-]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{20,}|(api[_-]?key|secret[_-]?key|private[_-]?key|firebase[_-]?api|password|credential|token)\s*[:=]\s*["'']?\S{12,}'
$highConfidenceSecretDiff = @($allDiffOutput | Select-String -Pattern $highConfidenceSecretPattern -CaseSensitive:$false)
if ($highConfidenceSecretDiff.Count -gt 0) {
    Add-Failure "Diff contains high-confidence secret-looking values. Review before release:`n$($highConfidenceSecretDiff -join "`n")"
}

$sensitiveDiffKeywordPattern = 'api_key|apikey|secret_key|token|password|credential|private_key|firebase_api|sk-|Bearer'
$sensitiveDiffKeywords = @($allDiffOutput | Select-String -Pattern $sensitiveDiffKeywordPattern -CaseSensitive:$false)
if ($sensitiveDiffKeywords.Count -gt 0) {
    Add-Warning "Diff contains low-confidence sensitive keywords. Manual semantic review is required:`n$($sensitiveDiffKeywords -join "`n")"
}

$staged = @(& git diff --cached --name-only)
if ($staged.Count -gt 0) {
    Add-Warning "Staged files are present:`n$($staged -join "`n")"
}

$status = @(& git status --short)
if ($status.Count -gt 0) {
    Write-Host 'Working tree changes:'
    $status | ForEach-Object { Write-Host "  $_" }
    Write-Host ''
} else {
    Write-Host 'Working tree is clean.'
    Write-Host ''
}

if ($warnings.Count -gt 0) {
    Write-Host 'Warnings:'
    foreach ($warning in $warnings) {
        Write-Host "  - $warning"
    }
    Write-Host ''
}

if ($failures.Count -gt 0) {
    Write-Host 'Failures:'
    foreach ($failure in $failures) {
        Write-Host "  - $failure"
    }
    exit 1
}

Write-Host 'Automated guardrail passed. Manual semantic privacy review is still required before release.'
