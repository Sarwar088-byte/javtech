param(
    [string]$Message = "Update site"
)

$ErrorActionPreference = "Stop"

Write-Host "=== [1/2] Syncing to GitHub (Sarwar088-byte/javtech) ===" -ForegroundColor Cyan
git add .
$status = git status --porcelain
if ($status) {
    git commit -m "$Message"
} else {
    Write-Host "Working tree clean. Checking remote sync..." -ForegroundColor Yellow
}

try {
    # Check if origin has javtech-project as subfolder
    $hasSubfolder = $false
    try {
        $remoteTree = git ls-tree origin/main javtech-project 2>$null
        if ($remoteTree -like "*javtech-project*") {
            $hasSubfolder = $true
        }
    } catch {}

    if ($hasSubfolder) {
        $tree = git write-tree
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "git"
        $psi.Arguments = "mktree"
        $psi.RedirectStandardInput = $true
        $psi.RedirectStandardOutput = $true
        $psi.UseShellExecute = $false
        $p = [System.Diagnostics.Process]::Start($psi)
        $p.StandardInput.Write("040000 tree $tree`tjavtech-project`n")
        $p.StandardInput.Close()
        $rootTree = $p.StandardOutput.ReadToEnd().Trim()
        $p.WaitForExit()

        $parent = (git rev-parse origin/main 2>$null)
        if ($parent) {
            $commit = git commit-tree $rootTree -p $parent -m "$Message"
        } else {
            $commit = git commit-tree $rootTree -m "$Message"
        }
        git push origin "${commit}:refs/heads/main"
    } else {
        git push origin main
    }
    Write-Host "Git push to GitHub successful!" -ForegroundColor Green
} catch {
    Write-Host "Git push warning: $_" -ForegroundColor Yellow
    Write-Host "Tip: If authentication is required, run 'git push origin main' in your terminal or set a GitHub Personal Access Token." -ForegroundColor Gray
}

Write-Host "=== [2/2] Deploying to Cloudflare Pages ===" -ForegroundColor Cyan
$env:XDG_CONFIG_HOME = "$PSScriptRoot\.wrangler_config"

# Load .env if present
if (Test-Path "$PSScriptRoot\.env") {
    Get-Content "$PSScriptRoot\.env" | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $name = $parts[0].Trim()
            $value = $parts[1].Trim().Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

try {
    npx wrangler pages deploy . --project-name javtech-project --commit-dirty=true
    Write-Host "=== Deployment to Cloudflare Pages Complete! ===" -ForegroundColor Green
    Write-Host "Live at: https://javtech-project.pages.dev" -ForegroundColor Green
} catch {
    Write-Host "Cloudflare deployment failed: $_" -ForegroundColor Red
    exit 1
}
