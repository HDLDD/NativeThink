# Generates icon-1024.png (NativeThink brand: teal gradient + ripple ring + N)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$size = 1024
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::Transparent)

$rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 0, 210, 169),
  [System.Drawing.Color]::FromArgb(255, 0, 150, 130),
  55.0)
# 满版方形底（Android 自适应图标会自行裁圆角）
$g.FillRectangle($bgBrush, $rect)

# 涟漪环（品牌记忆点）
$ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(70, 255, 255, 255), [float]($size * 0.028))
$g.DrawEllipse($ringPen, [float]($size * 0.10), [float]($size * 0.10), [float]($size * 0.80), [float]($size * 0.80))

# 字母 N
$font = New-Object System.Drawing.Font('Segoe UI', [float]($size * 0.52), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString('N', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, ($size * 0.01), $size, $size)), $fmt)

$g.Dispose()
$out = Join-Path $PSScriptRoot 'icon-1024.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "saved: $out"
