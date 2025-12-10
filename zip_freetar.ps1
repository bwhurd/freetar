$root = "C:\Users\bwhur\freetar"
$subTree = "C:\Users\bwhur\freetar\freetar"
$dst = "C:\Dropbox\Backup\FreetarBackupSmallZips"

New-Item -ItemType Directory -Force -Path $dst | Out-Null

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$zip = Join-Path $dst "freetar_$ts.zip"

$rootFiles = Get-ChildItem -Path $root -File
$subFolder = Get-Item -Path $subTree

$pathsToZip = @()
$pathsToZip += $rootFiles.FullName
$pathsToZip += $subFolder.FullName

Compress-Archive -Path $pathsToZip `
    -DestinationPath $zip `
    -CompressionLevel Fastest `
    -Force