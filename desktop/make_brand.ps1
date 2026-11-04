Add-Type -AssemblyName System.Drawing
$logo = [System.Drawing.Image]::FromFile("$PSScriptRoot\..\public\icon-512.png")

function New-BiofleetCanvas($w, $h) {
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAlias'
    $g.InterpolationMode = 'HighQualityBicubic'
    $rect = New-Object System.Drawing.Rectangle 0,0,$w,$h
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,
      ([System.Drawing.Color]::FromArgb(10,17,40)),
      ([System.Drawing.Color]::FromArgb(3,6,14)), 90
    $g.FillRectangle($brush, $rect)
    return @{ bmp=$bmp; g=$g }
}

# ── SIDEBAR 164x314 ──
$c = New-BiofleetCanvas 164 314
$g = $c.g; $bmp = $c.bmp

# aro de bronce doble
$pRing = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(190,251,191,36)), 2
$g.DrawEllipse($pRing, 36, 88, 92, 92)
$pRing2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60,251,191,36)), 1
$g.DrawEllipse($pRing2, 44, 96, 76, 76)

# logo real centrado en el aro
$g.DrawImage($logo, 48, 100, 68, 68)

$sf = New-Object System.Drawing.StringFormat; $sf.Alignment='Center'; $sf.LineAlignment='Center'
$fT = New-Object System.Drawing.Font ('Segoe UI'), 14, ([System.Drawing.FontStyle]::Bold)
$bGold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(251,191,36))
$g.DrawString('BIOFLEET', $fT, $bGold, (New-Object System.Drawing.RectangleF 0,192,164,26), $sf)

$fS = New-Object System.Drawing.Font ('Segoe UI'), 7
$bSub = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(141,164,197))
$g.DrawString('H U B   ·   S C A D A', $fS, $bSub, (New-Object System.Drawing.RectangleF 0,218,164,16), $sf)

$pGold = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(110,251,191,36)), 1
$g.DrawLine($pGold, 34, 288, 130, 288)
$fF = New-Object System.Drawing.Font ('Segoe UI'), 6.5
$g.DrawString('CONTROL INDUSTRIAL LOCAL', $fF, $bSub, (New-Object System.Drawing.RectangleF 0,292,164,16), $sf)

New-Item -ItemType Directory -Force '.\build' | Out-Null
$bmp.Save('.\build\installerSidebar.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Save('.\build\uninstallerSidebar.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $bmp.Dispose()

# ── HEADER 150x57 (paginas interiores) ──
$c = New-BiofleetCanvas 150 57
$g = $c.g; $bmp = $c.bmp
$g.DrawImage($logo, 8, 7, 42, 42)
$fH = New-Object System.Drawing.Font ('Segoe UI'), 10, ([System.Drawing.FontStyle]::Bold)
$g.DrawString('Biofleet', $fH, $bGold, 58, 8)
$fH2 = New-Object System.Drawing.Font ('Segoe UI'), 7
$bSub2 = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(141,164,197))
$g.DrawString('Industrial Control Hub', $fH2, $bSub2, 58, 30)
$bmp.Save('.\build\installerHeader.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Save('.\build\uninstallerHeader.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $bmp.Dispose()
$logo.Dispose()
Write-Output "BITMAPS OK"
