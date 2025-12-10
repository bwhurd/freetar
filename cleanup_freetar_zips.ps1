$backupDir = "C:\Users\bwhur\Dropbox\Backup\FreetarBackupSmallZips"

if (-not (Test-Path $backupDir)) {
    return
}

$now = Get-Date
$cutoffDaily = $now.AddDays(-7)   # >7 days → max 1 per day
$cutoffWeekly = $now.AddDays(-30)  # >30 days → max 1 per week, with monthly rule

$files = Get-ChildItem -Path $backupDir -File -Filter '*.zip'

# 1. Files older than 7 days but not older than 30 days: keep max 1 per day
$dailyCandidates = $files |
Where-Object { $_.LastWriteTime -le $cutoffDaily -and $_.LastWriteTime -gt $cutoffWeekly }

$dailyCandidates |
Group-Object { $_.LastWriteTime.Date } |
ForEach-Object {
    $_.Group |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 1 |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

# Helper: bucket a date to its week start (Sunday-based)
function Get-WeekBucketDate([datetime]$dt) {
    $dow = [int]$dt.DayOfWeek  # Sunday = 0
    return $dt.Date.AddDays(-$dow)
}

# 2. Files older than 30 days:
#    - group by month
#    - if a month has < 4 backups, keep all
#    - otherwise max 1 per week in that month
$weeklyCandidates = $files |
Where-Object { $_.LastWriteTime -le $cutoffWeekly }

$weeklyCandidates |
Group-Object { "{0:yyyy-MM}" -f $_.LastWriteTime } |
ForEach-Object {
    $monthGroup = $_.Group

    # If fewer than 4 backups in that month, do nothing
    if ($monthGroup.Count -lt 4) {
        return
    }

    # Enforce max 1 per week for that month
    $monthGroup |
    Group-Object { Get-WeekBucketDate($_.LastWriteTime) } |
    ForEach-Object {
        $_.Group |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip 1 |
        Remove-Item -Force -ErrorAction SilentlyContinue
    }
}
