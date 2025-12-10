# Always start in script directory
Set-Location -Path $PSScriptRoot

$projectDir = $PSScriptRoot
$pythonExe = Join-Path $projectDir ".venv\Scripts\python.exe"

Write-Host "Checking for processes on port 22000..."

$lines = netstat -ano | Select-String ":22000" | Select-Object -ExpandProperty Line
$pids = @()

foreach ($line in $lines) {
    if ($line -match "\s+(\d+)$") {
        $pids += $Matches[1]
    }
}

$pids = $pids | Sort-Object -Unique

foreach ($p in $pids) {
    try {
        Write-Host "Stopping process $p on port 22000..."
        Stop-Process -Id $p -Force -ErrorAction Stop
    }
    catch {
        Write-Host "Could not stop PID $p. $_"
    }
}

Write-Host "Verifying port clearance..."
Start-Sleep -Milliseconds 500

$still = netstat -ano | Select-String ":22000"
if ($still) {
    Write-Host "Port 22000 still busy. Attempting secondary cleanup..."
    $tcp = Get-NetTCPConnection -LocalPort 22000 -ErrorAction SilentlyContinue
    if ($tcp) {
        $tcpPids = $tcp.OwningProcess | Sort-Object -Unique
        foreach ($tpid in $tcpPids) {
            try {
                Write-Host "Force stopping fallback PID $tpid..."
                Stop-Process -Id $tpid -Force
            }
            catch {
                Write-Host "Failed to stop fallback PID $tpid. $_"
            }
        }
    }
}

# Force safe bind behavior
$env:FREETAR_HOST = "127.0.0.1"
$env:FREETAR_PORT = "22000"
$env:FREETAR_DEBUG = "0"

Write-Host "Starting Freetar server..."
& $pythonExe -c "from freetar.backend import main; main()"
