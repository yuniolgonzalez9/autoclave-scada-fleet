Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 164, 314
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAlias'

# Fondo: gradiente navy profundo
$rect = New-Object System.Drawing.Rectangle 0,0,164,314
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect,
  ([System.Drawing.Color]::FromArgb(13,23,52)),
  ([System.Drawing.Color]::FromArgb(4,7,15)), 90
$g.FillRectangle($brush, $rect)

# Rejilla sutil dorada
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(20,234,179,8)), 1
for($i=0; $i -lt 314; $i+=26){ $g.DrawLine($pen, 0, $i, 164, $i); $g.DrawLine($pen, $i, 0, $i, 314) }

# Anillo exterior
$pRing = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(200,251,191,36)), 2
$g.DrawEllipse($pRing, 37, 92, 90, 90)
$pRing2 = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80,251,191,36)), 1
$g.DrawEllipse($pRing2, 44, 99, 76, 76)

# Emblema B
$fB = New-Object System.Drawing.Font ('Segoe UI'), 44, ([System.Drawing.FontStyle]::Bold)
$bGold = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(251,191,36))
$sf = New-Object System.Drawing.StringFormat; $sf.Alignment='Center'; $sf.LineAlignment='Center'
$g.DrawString('B', $fB, $bGold, (New-Object System.Drawing.RectangleF 37,92,90,90), $sf)

# BIOFLEET vertical-ish bajo el emblema
$fT = New-Object System.Drawing.Font ('Segoe UI'), 13, ([System.Drawing.FontStyle]::Bold)
$g.DrawString('BIOFLEET', $fT, $bGold, (New-Object System.Drawing.RectangleF 0,196,164,26), $sf)
$fS = New-Object System.Drawing.Font 'Segoe UI', 7
$bSub = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(147,164,195))
$g.DrawString('H U B   ·   S C A D A', $fS, $bSub, (New-Object System.Drawing.RectangleF 0,222,164,18), $sf)

# Línea oro al pie
$pGold = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120,251,191,36)), 1
$g.DrawLine($pGold, 30, 288, 134, 288)
$fF = New-Object System.Drawing.Font 'Segoe UI', 6.5
$g.DrawString('CONTROL INDUSTRIAL LOCAL', $fF, $bSub, (New-Object System.Drawing.RectangleF 0,292,164,16), $sf)

New-Item -ItemType Directory -Force '.\build' | Out-Null
$bmp.Save('.\build\installerSidebar.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Save('.\build\uninstallerSidebar.bmp', [System.Drawing.Imaging.ImageFormat]::Bmp)
$g.Dispose(); $bmp.Dispose()
Write-Output "BITMAPS OK"
