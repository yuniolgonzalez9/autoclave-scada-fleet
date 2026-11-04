param([int]$Seconds = 40, [string]$Port = "COM4", [int]$Baud = 115200, [string]$Log = "serial_check.log")
$p = New-Object System.IO.Ports.SerialPort($Port, $Baud, 'None', 8, 'One')
$p.ReadTimeout = 500
$p.Open()
$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
    try {
        $d = $p.ReadExisting()
        if ($d) { [IO.File]::AppendAllText($Log, $d) }
    } catch {}
    Start-Sleep -Milliseconds 200
}
$p.Close()
Write-Output "DONE $($sw.Elapsed.TotalSeconds)s"
