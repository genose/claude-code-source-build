# Claudius installer for Windows (PowerShell)
# Usage: irm https://raw.githubusercontent.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer/noavx_esbuild/install.ps1 | iex

$ErrorActionPreference = 'Stop'

$REPO    = "https://github.com/genose/claude-code-source-build-community-edition-noAVX-foroldtimer.git"
$BRANCH  = "noavx_esbuild"
$InstallDir = if ($env:CLAUDIUS_INSTALL_DIR) { $env:CLAUDIUS_INSTALL_DIR } else { "$HOME\.claudius" }
$BinDir     = if ($env:CLAUDIUS_BIN_DIR)     { $env:CLAUDIUS_BIN_DIR }     else { "$HOME\.local\bin" }
$CMD        = "claudius"

Write-Host "==> Installing Claudius (Claude Code - Community Edition no-AVX)"
Write-Host "    Install dir : $InstallDir"
Write-Host "    Command     : $BinDir\$CMD.cmd"
Write-Host ""

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js >= 20 is required but not found. Install from https://nodejs.org"
    exit 1
}
$nodeMajor = [int](node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if ($nodeMajor -lt 20) {
    Write-Error "Node.js >= 20 required (found v$(node --version))."
    exit 1
}

# Check git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git is required but not found. Install from https://git-scm.com"
    exit 1
}

# Clone or update
if (Test-Path "$InstallDir\.git") {
    Write-Host "==> Updating existing install at $InstallDir"
    git -C $InstallDir fetch origin $BRANCH
    git -C $InstallDir checkout $BRANCH
    git -C $InstallDir reset --hard "origin/$BRANCH"
} else {
    Write-Host "==> Cloning repo..."
    git clone --branch $BRANCH --depth 1 $REPO $InstallDir
}

# Install dependencies (esbuild etc.)
Write-Host "==> Installing dependencies..."
Set-Location $InstallDir
npm install --silent

# Build
Write-Host "==> Building..."
npm run build

# Install wrapper
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$wrapper = "$BinDir\$CMD.cmd"
Set-Content -Path $wrapper -Value "@echo off`r`nnode `"$InstallDir\dist\cli.js`" %*"

# Create claude.cmd -> claudius.cmd so VS Code / JetBrains extensions work without config changes.
# Only created/updated if the target is absent or already points to our wrapper.
$claudeWrapper = "$BinDir\claude.cmd"
$ourContent = "@echo off`r`nnode `"$InstallDir\dist\cli.js`" %*"
if (-not (Test-Path $claudeWrapper) -or (Get-Content $claudeWrapper -Raw) -eq $ourContent) {
    Set-Content -Path $claudeWrapper -Value $ourContent
    Write-Host "    Also created: $claudeWrapper (claude -> claudius)"
} else {
    Write-Host "    NOTE: $claudeWrapper already exists with different content — skipping."
    Write-Host "          VS Code extensions may use the official claude binary on that path."
}

Write-Host ""
Write-Host "==> Done! Run: $CMD  (or: claude)"
Write-Host ""

# PATH hint
$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($userPath -notlike "*$BinDir*") {
    Write-Host "    NOTE: Add $BinDir to your PATH:"
    Write-Host "      [Environment]::SetEnvironmentVariable('PATH', `$env:PATH + ';$BinDir', 'User')"
    Write-Host "    Or run the above in PowerShell to set it permanently."
    Write-Host ""
}

# Verify
Write-Host "==> Verifying..."
try {
    & "$BinDir\$CMD.cmd" --version
    Write-Host ""
    Write-Host "    claudius is ready."
} catch {
    Write-Warning "Could not verify claudius. Check that $BinDir is in your PATH."
}
