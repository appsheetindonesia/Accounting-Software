<#
.SYNOPSIS
    Cek status GitHub Actions via REST API dan laporkan per job.

.DESCRIPTION
    Skrip pemantauan CI tanpa curl manual / tanpa membuka browser. Menampilkan
    run terbaru workflow (CI, E2E, Pages) untuk commit/branch yang diminta,
    lengkap dengan status tiap job dan — bila ada kegagalan — step yang gagal.

    Auth (dipilih berurutan):
      1. Env GH_TOKEN / GITHUB_TOKEN
      2. gh CLI (gh auth token)
      3. Git Credential Manager (token tersimpan untuk https://github.com)

    Contoh pemakaian:
      .\scripts\check-ci.ps1                          # run terbaru branch aktif
      .\scripts\check-ci.ps1 -Commit bc5c0ad          # run untuk commit tertentu
      .\scripts\check-ci.ps1 -Workflow ci.yml         # filter nama workflow
      .\scripts\check-ci.ps1 -Watch                   # poll tiap 30 dtk sampai selesai
      .\scripts\check-ci.ps1 -Refresh 60 -Watch       # poll tiap 60 dtk
      .\scripts\check-ci.ps1 -Limit 3                 # tampilkan 3 run terbaru
#>
[CmdletBinding()]
param(
    # Branch (default: branch aktif). Diabaikan bila -Commit diberikan.
    [string]$Branch,
    # Komit SHA (bisa prefix pendek) — hanya run dengan head_sha tsb.
    [string]$Commit,
    # Filter nama workflow (mis. "ci.yml", "E2E"). Kosong = semua.
    [string]$Workflow,
    # Jumlah run terbaru yang ditampilkan (default 5).
    [int]$Limit = 5,
    # Polling: tunggu sampai semua run selesai, refresh tiap N detik.
    [switch]$Watch,
    # Interval polling dalam detik (default 30).
    [int]$Refresh = 30,
    # Repo owner/name eksplisit (default: dibaca dari git remote origin).
    [string]$Repo
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# ---------------------------------------------------------------
# 1. Resolve repo & token
# ---------------------------------------------------------------
function Get-RepoName {
    param([string]$RemoteUrl)
    if ($RemoteUrl -match 'github\.com[:/]([^/]+)/([^/]+?)(\.git)?$') {
        return "$($matches[1])/$($matches[2])"
    }
    throw "Tidak dapat menebak owner/repo dari remote: $RemoteUrl — gunakan -Repo owner/name"
}

function Get-GitHubToken {
    if ($env:GH_TOKEN) { return $env:GH_TOKEN }
    if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN }
    $gh = Get-Command gh -ErrorAction SilentlyContinue
    if ($gh) {
        $tok = (& gh auth token 2>$null | Out-String).Trim()
        if ($tok) { return $tok }
    }
    # Git Credential Manager — token HTTPS github.com yang tersimpan.
    $cred = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null | Select-String '^password='
    if ($cred) { return ($cred.Line -replace '^password=', '') }
    throw "Tidak ada token GitHub. Set env GH_TOKEN/GITHUB_TOKEN, login gh CLI, atau pastikan git credential tersimpan."
}

if (-not $Repo) {
    $remote = (git remote get-url origin 2>$null | Out-String).Trim()
    if (-not $remote) { throw 'Repo tidak terdeteksi — jalankan dari dalam repo atau berikan -Repo owner/name' }
    $Repo = Get-RepoName $remote
}
$Token = Get-GitHubToken
$Api = "https://api.github.com/repos/$Repo"
$Headers = @{ Authorization = "Bearer $Token"; 'User-Agent' = 'check-ci.ps1'; Accept = 'application/vnd.github+json' }

if (-not $Branch -and -not $Commit) {
    $Branch = (git branch --show-current 2>$null | Out-String).Trim()
    if (-not $Branch) { $Branch = 'main' }
    Write-Host "[check-ci] Branch: $Branch" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------
# 2. Ambil daftar run
# ---------------------------------------------------------------
function Get-Runs {
    $q = @()
    if ($Branch) { $q += "branch=$([uri]::EscapeDataString($Branch))" }
    # Catatan: param `workflow=` di API ini TIDAK konsisten (sering diabaikan
    # dan mengembalikan SEMUA workflow) — jadi filter -Workflow dilakukan
    # client-side di bawah dengan mencocokkan nama run.
    # head_sha di GitHub API WAJIB SHA penuh 40 karakter; prefix pendek (mis.
    # bc5c0ad) tidak cocok. Untuk short SHA: ambil run terbaru lalu filter
    # client-side dengan StartsWith.
    if ($Commit -and $Commit.Length -ge 40) { $q += "head_sha=$Commit" }
    $url = "$Api/actions/runs?per_page=100"
    if ($q.Count) { $url += '&' + ($q -join '&') }
    $runs = Invoke-RestMethod -Uri $url -Headers $Headers
    if (-not $runs.workflow_runs -or $runs.workflow_runs.Count -eq 0) {
        Write-Host "[check-ci] Tidak ada run ditemukan" -ForegroundColor Yellow
        return @()
    }
    $list = @($runs.workflow_runs)
    if ($Commit -and $Commit.Length -lt 40) {
        $list = @($list | Where-Object { $_.head_sha.StartsWith($Commit, [System.StringComparison]::OrdinalIgnoreCase) })
    }
    if ($Workflow) {
        $list = @($list | Where-Object { $_.name -like "*$Workflow*" })
    }
    if (-not $list) {
        Write-Host "[check-ci] Tidak ada run ditemukan untuk filter yang diminta" -ForegroundColor Yellow
        return @()
    }
    return @($list | Select-Object -First $Limit)
}

# ---------------------------------------------------------------
# 3. Ambil job per run
# ---------------------------------------------------------------
function Get-Jobs {
    param([int64]$RunId)
    $jobs = Invoke-RestMethod -Uri "$Api/actions/runs/$RunId/jobs?per_page=100" -Headers $Headers
    return @($jobs.jobs)
}

function Format-Duration {
    param([string]$Started, [string]$Completed)
    if (-not $Started) { return '' }
    $s = [datetime]::Parse($Started).ToUniversalTime()
    if ($Completed) { $e = [datetime]::Parse($Completed).ToUniversalTime() } else { $e = [datetime]::UtcNow }
    $d = $e - $s
    return "$([math]::Floor($d.TotalMinutes))m$($d.Seconds.ToString('00'))s"
}

# ---------------------------------------------------------------
# 4. Tampilkan satu run + job-jobnya
# ---------------------------------------------------------------
function Show-Run {
    param($Run)
    $conclusion = $Run.conclusion
    $color = switch ($conclusion) {
        'success' { 'Green' }
        'failure' { 'Red' }
        'cancelled' { 'DarkYellow' }
        'skipped' { 'DarkGray' }
        default { 'Yellow' } # in_progress / pending / null
    }
    $statusLabel = if ($Run.status -eq 'completed') { $conclusion } else { $Run.status }
    Write-Host "`n=== $($Run.name) | $statusLabel | $($Run.head_sha.Substring(0,7)) | $($Run.event) ===" -ForegroundColor $color
    Write-Host "    URL: $($Run.html_url)" -ForegroundColor DarkGray

    $jobs = Get-Jobs -RunId $Run.id
    foreach ($j in $jobs) {
        $jColor = switch ($j.conclusion) {
            'success' { 'Green' }
            'failure' { 'Red' }
            'cancelled' { 'DarkYellow' }
            'skipped' { 'DarkGray' }
            default { 'Yellow' }
        }
        $jStatus = if ($j.status -eq 'completed') { $j.conclusion } else { $j.status }
        $dur = Format-Duration -Started $j.started_at -Completed $j.completed_at
        Write-Host ("  {0,-10} {1}  {2}" -f $jStatus, $j.name, $dur) -ForegroundColor $jColor

        # Job GAGAL → tampilkan step yang gagal (biar langsung tahu penyebabnya)
        if ($j.conclusion -eq 'failure' -and $j.steps) {
            foreach ($st in $j.steps) {
                if ($st.conclusion -eq 'failure') {
                    Write-Host ("      FAILED STEP: {0}" -f $st.name) -ForegroundColor Red
                }
            }
            # Tautan log job (di dalam run) untuk debug lebih dalam
            Write-Host "      Log: $($j.html_url)" -ForegroundColor DarkGray
        }
    }
}

# ---------------------------------------------------------------
# 5. Eksekusi
# ---------------------------------------------------------------
function Run-Check {
    $runs = Get-Runs
    if (-not $runs) { return $false }
    $allDone = $true
    foreach ($r in $runs) {
        Show-Run -Run $r
        if ($r.status -ne 'completed') { $allDone = $false }
    }
    return $allDone
}

if ($Watch) {
    Write-Host "[check-ci] Watch mode — refresh tiap ${Refresh}s (Ctrl+C untuk berhenti)" -ForegroundColor Cyan
    while ($true) {
        Clear-Host
        Write-Host "[check-ci] $(Get-Date -Format 'HH:mm:ss') — repo $Repo" -ForegroundColor Cyan
        try {
            $done = Run-Check
            if ($done) {
                Write-Host "`n[check-ci] Semua run selesai." -ForegroundColor Green
                break
            }
        } catch {
            Write-Host "[check-ci] Error: $($_.Exception.Message)" -ForegroundColor Red
        }
        Start-Sleep -Seconds $Refresh
    }
} else {
    try {
        Run-Check | Out-Null
    } catch {
        Write-Host "[check-ci] Error: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}
