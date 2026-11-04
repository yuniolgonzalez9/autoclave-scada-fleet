param([int]$Seconds = 45, [string]$Port = "COM4", [string]$Log = "serial_v123.log")
$p = New-Object System.IO.Ports.SerialPort($Port, 115200, 'None', 8, 'One')
$p.ReadTimeout = 500
$p.DtrEnable = $false; $p.RtsEnable = $false
$p.Open()
# RTS pulse = reset (EN pin)
$p.RtsEnable = $true; Start-Sleep -Milliseconds 120; $p.RtsEnable = $false
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
    try { $d = $p.ReadExisting(); if ($d) { [IO.File]::AppendAllText($Log, $d) } } catch {}
    Start-Sleep -Milliseconds 200
}
$p.Close()
Write-Output "DONE $($sw.Elapsed.TotalSeconds)s"
