param()

function Get-NextVersionedPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BaseDirectory,

        [Parameter(Mandatory = $true)]
        [string]$Stem,

        [string]$Extension = ".css"
    )

    if (-not (Test-Path $BaseDirectory)) {
        New-Item -ItemType Directory -Path $BaseDirectory | Out-Null
    }

    $ext = if ($Extension.StartsWith(".")) { $Extension } else { "." + $Extension }

    $regex = "^{0}_(\d+){1}$" -f [regex]::Escape($Stem), [regex]::Escape($ext)
    $max = 0

    Get-ChildItem -Path $BaseDirectory -Filter "$Stem*$ext" -File -ErrorAction SilentlyContinue |
        ForEach-Object {
            if ($_.Name -match $regex) {
                $n = 0
                [int]::TryParse($matches[1], [ref]$n) | Out-Null
                if ($n -gt $max) { $max = $n }
            }
        }

    $next = $max + 1
    $fileName = "{0}_{1:D2}{2}" -f $Stem, $next, $ext
    return (Join-Path $BaseDirectory $fileName)
}

$toolsDir   = $PSScriptRoot
$projectDir = Split-Path $toolsDir -Parent

Write-Host "Enter original CSS filename (e.g. freetar/static/my-chords.css) or full path:"
$cssInput = Read-Host
if (-not $cssInput) {
    Write-Error "No CSS file provided"
    exit 1
}

if (Test-Path $cssInput) {
    $origCssPath = (Resolve-Path $cssInput).Path
} else {
    $candidate = Join-Path $projectDir $cssInput
    if (Test-Path $candidate) {
        $origCssPath = (Resolve-Path $candidate).Path
    } else {
        Write-Error "CSS file not found: $cssInput"
        exit 1
    }
}

$origName = [IO.Path]::GetFileNameWithoutExtension($origCssPath)
$origExt  = [IO.Path]::GetExtension($origCssPath)

Write-Host "Enter HTML snapshot file for PurgeCSS (full path). Leave blank to skip PurgeCSS:"
$htmlInput = Read-Host

$htmlPath = $null
if ($htmlInput) {
    if (Test-Path $htmlInput) {
        $htmlPath = (Resolve-Path $htmlInput).Path
    } else {
        Write-Warning "HTML snapshot '$htmlInput' not found. PurgeCSS will be skipped."
    }
}

# 1) Backup original CSS
$backupStem = "$origName-backup"
$backupPath = Get-NextVersionedPath -BaseDirectory $toolsDir -Stem $backupStem -Extension $origExt
Copy-Item $origCssPath $backupPath -Force
Write-Host "Backup saved as $backupPath"

# 2) Normalize CSS via postcss-safe-parser
$normalizeScript = Join-Path $toolsDir "normalize-css.cjs"
$normalizedStem  = "$origName-normalized"
$normalizedCss   = Get-NextVersionedPath -BaseDirectory $toolsDir -Stem $normalizedStem -Extension $origExt

Write-Host "Normalizing CSS via postcss-safe-parser (dropping all comments)..."
node $normalizeScript "$origCssPath" "$normalizedCss"

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $normalizedCss)) {
    Write-Error "Normalization failed. See normalize-css.cjs output."
    exit 1
}
Write-Host "Normalized CSS written to: $normalizedCss"

$sourceForNext = $normalizedCss

# 3) Optional PurgeCSS, parse JSON output and extract only .css
$purgedCss = $null
if ($htmlPath) {
    $purgedStem = "$origName-purged"
    $purgedCss  = Get-NextVersionedPath -BaseDirectory $toolsDir -Stem $purgedStem -Extension $origExt

    Write-Host "Running PurgeCSS using HTML snapshot: $htmlPath"

    $purgedJson = npx purgecss --css "$normalizedCss" --content "$htmlPath"
    $purgeExit = $LASTEXITCODE

    if ($purgeExit -eq 0 -and $purgedJson) {
        try {
            $purgedObj = $purgedJson | ConvertFrom-Json

            if ($purgedObj -is [System.Array]) {
                $cssText = $purgedObj[0].css
            } else {
                $cssText = $purgedObj.css
            }

            if ([string]::IsNullOrWhiteSpace($cssText)) {
                throw "PurgeCSS JSON did not contain a non-empty 'css' field."
            }

            $cssText | Out-File -FilePath $purgedCss -Encoding utf8
            Write-Host "Purged CSS written to: $purgedCss"
            $sourceForNext = $purgedCss
        }
        catch {
            Write-Warning "Could not parse PurgeCSS JSON output. Using normalized CSS instead. $_"
            $purgedCss = $null
            $sourceForNext = $normalizedCss
        }
    } else {
        Write-Warning "PurgeCSS failed (exit $purgeExit). Using normalized CSS instead."
        $purgedCss = $null
        $sourceForNext = $normalizedCss
    }
} else {
    Write-Host "PurgeCSS skipped (no HTML snapshot provided)."
}

Write-Host "Cleaned CSS before Prettier is: $sourceForNext"

# 4) Prettier on the cleaned CSS
$prettyStem = "$origName-cleaned-and-pretty"
$prettyPath = Get-NextVersionedPath -BaseDirectory $toolsDir -Stem $prettyStem -Extension $origExt

Copy-Item $sourceForNext $prettyPath -Force

Write-Host "Running Prettier on $prettyPath"
npx prettier --parser css --log-level silent --write "$prettyPath"

if (-not (Test-Path $prettyPath)) {
    Write-Warning "Prettier did not produce expected file. Falling back to pre-Prettier CSS."
    $finalPath = $sourceForNext
} else {
    $finalPath = $prettyPath
}

Write-Host "Final cleaned CSS file: $finalPath"
