# start-freetar.ps1
# Run with: powershell -ExecutionPolicy Bypass -File start-freetar.ps1
$projectDir = "C:\Users\bwhur\freetar"
$venvScripts = "$projectDir\.venv\Scripts"
$pythonExe = "$venvScripts\python.exe"
$activate = "$venvScripts\Activate.ps1"

# Kill any process listening on port 22000 (Freetar default)
Write-Host "Checking for processes on port 22000..."
$netstat = netstat -ano | Select-String ":22000"
if ($netstat) {
    $pids = $netstat | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique
    foreach ($pid in $pids) {
        if ($pid -match '^\d+$') {
            try {
                Write-Host "Stopping process $pid using port 22000..."
                Stop-Process -Id $pid -Force
            }
            catch { }
        }
    }
}

# Activate the virtual environment
Write-Host "Activating virtual environment..."
& $activate

# Start the Freetar server
Write-Host "Starting Freetar server..."
Set-Location $projectDir
& $pythonExe -m freetar.backend
