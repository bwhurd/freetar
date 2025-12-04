$projectDir = "C:\Users\bwhur\freetar"
$venvScripts = "$projectDir\.venv\Scripts"
$pythonExe = "$venvScripts\python.exe"

Write-Host "Checking for processes on port 22000..."
$netstat = netstat -ano | Select-String ":22000"
if ($netstat) {
    $pids = $netstat | ForEach-Object {
        ($_ -split '\s+')[-1]
    } | Sort-Object -Unique
    foreach ($p in $pids) {
        if ($p -match '^\d+$' -and $p -ne '0') {
            try {
                Write-Host "Stopping process $p using port 22000..."
                Stop-Process -Id $p -Force
            }
            catch { }
        }
    }
}

Write-Host "Starting Freetar server..."
Set-Location $projectDir
& $pythonExe -m freetar.backend
