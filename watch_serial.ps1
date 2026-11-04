# watch_serial.ps1 — lado DISPOSITIVO: captura el serial de la placa
# con timestamp por línea. Corre Minutos min -> serial_watch.log
param([int]$Minutes = 15, [string]$Port = "COM4", [string]$Log = "serial_watch.log")

$p = New-Object System.IO.Ports.SerialPort($Port, 115200, 'None', 8, 'One')
$p.ReadTimeout = 400
try { $p.Open() } catch { Write-Output "NO SE PUDO ABRIR $Port"; exit 1 }
"tstamp|serial" | Out-File $Log
$fin = (Get-Date).AddMinutes($Minutes)
$buf = ""
while ((Get-Date) -lt $fin) {
    try { $buf += $p.ReadExisting() } catch {}
    while ($buf -match "`r?`n") {
        $idx = $buf.IndexOf("`n")
        $line = $buf.Substring(0, $idx).TrimEnd("`r")
        $buf = $buf.Substring($idx + 1)
        if ($line.Length -gt 0) {
            "$((Get-Date).ToString('HH:mm:ss.ff'))|$line" | Out-File $Log -Append
        }
    }
    Start-Sleep -Milliseconds 150
}
if ($buf.Trim()) { "$((Get-Date).ToString('HH:mm:ss.ff'))|$buf" | Out-File $Log -Append }
$p.Close()
Write-Output "LISTO -> serial_watch.log"
