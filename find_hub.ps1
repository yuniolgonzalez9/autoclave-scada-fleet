Get-Process -Id 19064 | Select-Object Id, ProcessName, Path | Format-List
$proc = Get-CimInstance Win32_Process -Filter "ProcessId=19064"
Write-Output "ExecutablePath: $($proc.ExecutablePath)"
Write-Output "CommandLine: $($proc.CommandLine)"
