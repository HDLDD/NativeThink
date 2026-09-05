# Generates icon.ico (256/64/32/16 px PNG-in-ICO) for NativeThink
# Teal-cyan rounded square + "N" wordmark, matching the app's design language
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function New-IconBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::Transparent)

  # Rounded-rect background: teal gradient hsl(182,70%,40%) -> deeper
  $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
  $radius = [int]($size * 0.22)
  $bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $radius * 2
  $bgPath.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
  $bgPath.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
  $bgPath.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
  $bgPath.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
  $bgPath.CloseFigure()

  $c1 = [System.Drawing.Color]::FromArgb(255, 0, 184, 148)   # #00B894
  $c2 = [System.Drawing.Color]::FromArgb(255, 0, 138, 168)   # teal-cyan deeper
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, 55.0)
  $g.FillPath($brush, $bgPath)

  # Soft ripple ring (brand motif)
  $ringPenW = [Math]::Max(2, [int]($size * 0.035))
  $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 255, 255, 255), $ringPenW)
  $ringSize = [int]($size * 0.72)
  $ringRect = New-Object System.Drawing.Rectangle(([int](($size - $ringSize) / 2)), ([int](($size - $ringSize) / 2)), $ringSize, $ringSize)
  $g.DrawEllipse($ringPen, $ringRect)

  # Letter N
  $fontSize = [int]($size * 0.52)
  $font = New-Object System.Drawing.Font('Segoe UI', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $white = [System.Drawing.Brushes]::White
  $textRect = New-Object System.Drawing.RectangleF(0, ($size * 0.02), $size, $size)
  $g.DrawString('N', $font, $white, $textRect, $fmt)

  $g.Dispose()
  return $bmp
}

$sizes = @(256, 64, 32, 16)
$pngs = @()
foreach ($s in $sizes) {
  $bmp = New-IconBitmap $s
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngs += , $ms.ToArray()
  $bmp.Dispose()
  $ms.Dispose()
}

# Assemble ICO: header + directory entries + PNG blobs
$outPath = Join-Path $PSScriptRoot '..' | Join-Path -ChildPath 'icon.ico'
$fs = [System.IO.File]::Create($outPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0)      # reserved
$bw.Write([uint16]1)      # type: icon
$bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $s = $sizes[$i]
  $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))  # width (0 = 256)
  $bw.Write([byte]($(if ($s -ge 256) { 0 } else { $s })))  # height
  $bw.Write([byte]0)    # palette
  $bw.Write([byte]0)    # reserved
  $bw.Write([uint16]1)  # color planes
  $bw.Write([uint16]32) # bits per pixel
  $bw.Write([uint32]$pngs[$i].Length)
  $bw.Write([uint32]$offset)
  $offset += $pngs[$i].Length
}
foreach ($png in $pngs) { $bw.Write($png) }
$bw.Close(); $fs.Close()
Write-Host "icon.ico written: $outPath"
