# Monitor de enlace ESP32<->Hub para diagnosticar el flap offline.
# Registra cada 2s: internet, ping a la placa, frescura de telemetria en
# el SQLite del Hub y broadcast UDP :4210. Corre 10 min y genera CSV.
param([int]$Minutes = 10, [string]$Esp32 = "192.168.0.100", [string]$Out = "link_watch.csv")

$db = "$env:APPDATA\biofleet-hub\data\biofleet.db"
$fin = (Get-Date).AddMinutes($Minutes)
"tstamp,internet,esp32_ping,db_age_s,udp_4210_listen,evento" | Out-File $Out
$udpSock = $null
try {
    $udpSock = New-Object System.Net.Sockets.UdpClient 0
    $udpSock.Connect("255.255.255.255", 4210)
} catch {}

$prev = @{}
while ((Get-Date) -lt $fin) {
    $ts = Get-Date -Format "HH:mm:ss.ff"
    $net = (Test-Connection -Quiet -Count 1 "8.8.8.8")
    $esp = (Test-Connection -Quiet -Count 1 $Esp32)
    $age = -1
    if (Test-Path $db) { $age = [math]::Round(((Get-Date) - (Get-Item $db).LastWriteTime).TotalSeconds) }
    $udp = @(Get-NetUDPEndpoint -LocalPort 4210 -ErrorAction SilentlyContinue).Count

    $ev = ""
    if ($net -ne $prev.net) { $ev += "INET->$net " }
    if ($esp -ne $prev.esp) { $ev += "ESP32->$esp " }
    if (($age -gt 10) -and ($prev.age -le 10)) { $ev += "TELEMETRIA_PERDIDA " }
    if (($age -le 10) -and ($prev.age -gt 10)) { $ev += "TELEMETRIA_VOLVIO " }
    if ($ev) { Write-Host "$ts  $ev" -ForegroundColor Yellow }

    "$ts,$net,$esp,$age,$udp,$ev" | Out-File $Out -Append
    $prev = @{ net=$net; esp=$esp; age=$age }
    Start-Sleep -Seconds 2
}
Write-Host "LISTO -> $Out"
