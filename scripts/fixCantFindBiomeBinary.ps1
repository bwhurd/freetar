param(
    [string]$ProjectRoot = "C:\Users\bwhur\freetar"
)

$ErrorActionPreference = "Stop"

Write-Host "Fixing Biome for project root: $ProjectRoot"

if (-not (Test-Path $ProjectRoot)) {
    Write-Error "Project root '$ProjectRoot' does not exist."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js is not installed or not on PATH. Install Node.js, then rerun this script."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Error "npm is not installed or not on PATH. Install Node.js with npm support, then rerun this script."
}

Push-Location $ProjectRoot
try {
    Write-Host "Using working directory: $(Get-Location)"

    Write-Host "Ensuring package.json exists..."
    if (-not (Test-Path "package.json")) {
        npm init -y
    }

    Write-Host "Installing Biome core package..."
    npm install --save-dev --save-exact @biomejs/biome

    Write-Host "Installing platform specific Biome CLI binary..."
    $os   = [System.Environment]::OSVersion.Platform
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture

    switch ($os) {
        "Win32NT" {
            if ($arch -eq "X64") {
                npm install --save-dev --save-exact @biomejs/cli-win32-x64
            } elseif ($arch -eq "Arm64") {
                npm install --save-dev --save-exact @biomejs/cli-win32-arm64
            } else {
                Write-Warning "Unsupported Windows architecture: $arch. Skipping platform specific CLI install."
            }
        }
        "MacOSX" {
            if ($arch -eq "X64") {
                npm install --save-dev --save-exact @biomejs/cli-darwin-x64
            } elseif ($arch -eq "Arm64") {
                npm install --save-dev --save-exact @biomejs/cli-darwin-arm64
            } else {
                Write-Warning "Unsupported macOS architecture: $arch. Skipping platform specific CLI install."
            }
        }
        "Unix" {
            if ($arch -eq "X64") {
                npm install --save-dev --save-exact @biomejs/cli-linux-x64
            } elseif ($arch -eq "Arm64") {
                npm install --save-dev --save-exact @biomejs/cli-linux-arm64
            } else {
                Write-Warning "Unsupported Linux architecture: $arch. Skipping platform specific CLI install."
            }
        }
        default {
            Write-Warning "Unknown OS platform: $os. Skipping platform specific CLI install."
        }
    }

    Write-Host "Checking for local Biome binary under node_modules\.bin..."

    $root     = Get-Location
    $biomeBin = Join-Path $root "node_modules\.bin\biome"
    $biomeCmd = Join-Path $root "node_modules\.bin\biome.cmd"

    if (Test-Path $biomeCmd) {
        $biomeBin = $biomeCmd
    }

    if (-not (Test-Path $biomeBin)) {
        Write-Warning "Biome binary still not found in node_modules\.bin. Check npm output above."
    } else {
        Write-Host "Biome binary detected at:"
        Write-Host "  $biomeBin"
        Write-Host ""
        Write-Host "Quick check:"
        Write-Host "  npx biome --version"
    }
}
finally {
    Pop-Location
}
