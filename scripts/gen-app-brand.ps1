# gen-app-brand.ps1 — 生成 NativeThink 的品牌视觉资产（APK 图标 + 启动图）
#
# 为什么是 PowerShell 而不是 Node：仓库里没有 canvas/sharp 之类的图形依赖，
# 而 GDI+ 在 Windows 上开箱可用，且能同时画矢量形状（N 字标 + ✦）和文字（NativeThink 字标）。
# 全部绘制在 4× 画布上完成再双三次下采样 —— 抗锯齿质量与设计软件导出接近。
#
# 产物（尺寸与原文件一一对应，直接覆盖）：
#   android/app/src/main/res/mipmap-*/ic_launcher_background.png   自适应图标底色（品牌渐变）
#   android/app/src/main/res/mipmap-*/ic_launcher_foreground.png   自适应图标前景（白色 N + ✦）
#   android/app/src/main/res/mipmap-*/ic_launcher.png              旧版方形图标（圆角遮罩）
#   android/app/src/main/res/mipmap-*/ic_launcher_round.png        旧版圆形图标
#   android/app/src/main/res/drawable*/splash.png                  启动图（尺寸沿用现有文件）
#   public/favicon.svg                                             Web 图标（同一套字标，SVG）
#   icon.ico                                                       Electron/Windows 图标
#
# 设计规范（改之前先读）：
#   品牌色 #00B894；字标 = 白色 N + 右上角四角星（"think" 的意象）；
#   自适应图标会被 XML 再 inset 16.7%（见 mipmap-anydpi-v26/ic_launcher.xml），
#   所以前景 PNG 里的字标要占画布约 78%，缩放后才落在 66dp 安全区内。
#
# 用法：pwsh -File scripts/gen-app-brand.ps1 [-Preview <png 输出路径>]

param([string]$Preview = '')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ResRoot = Join-Path $RepoRoot 'android/app/src/main/res'

# ── 品牌 token ───────────────────────────────────────────────────────────────
$BrandTop = [System.Drawing.Color]::FromArgb(255, 20, 217, 168)   # #14D9A8
$BrandBot = [System.Drawing.Color]::FromArgb(255, 0, 161, 131)    # #00A183
$NightTop = [System.Drawing.Color]::FromArgb(255, 5, 51, 44)      # #05332C
$NightBot = [System.Drawing.Color]::FromArgb(255, 14, 107, 87)    # #0E6B57
$Ink = [System.Drawing.Color]::White

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [single]($r * 2)
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-StarPath([single]$cx, [single]$cy, [single]$r) {
  $pts = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  $inner = [single]($r * 0.30)
  for ($i = 0; $i -lt 8; $i++) {
    $ang = (-90 + $i * 45) * [Math]::PI / 180
    $rad = if ($i % 2 -eq 0) { $r } else { $inner }
    $pts.Add((New-Object System.Drawing.PointF(
      [single]($cx + $rad * [Math]::Cos($ang)),
      [single]($cy + $rad * [Math]::Sin($ang)))))
  }
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.AddPolygon($pts.ToArray())
  return $p
}

function New-LinearBrush([single]$x, [single]$y, [single]$w, [single]$h, $c1, $c2) {
  $rect = New-Object System.Drawing.RectangleF($x, $y, $w, $h)
  $b = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [single]45)
  return $b
}

# 品牌渐变底色 + 左上角柔光（让纯色块有体积感）
function Draw-Backdrop($g, [single]$S, $c1, $c2) {
  $brush = New-LinearBrush 0 0 $S $S $c1 $c2
  $g.FillRectangle($brush, 0, 0, $S, $S)
  $brush.Dispose()

  $hl = New-Object System.Drawing.Drawing2D.GraphicsPath
  $hl.AddEllipse([single](-$S * 0.30), [single](-$S * 0.34), [single]($S * 1.05), [single]($S * 1.05))
  $pg = New-Object System.Drawing.Drawing2D.PathGradientBrush($hl)
  $pg.CenterPoint = New-Object System.Drawing.PointF([single]($S * 0.16), [single]($S * 0.14))
  $pg.CenterColor = [System.Drawing.Color]::FromArgb(58, 255, 255, 255)
  $pg.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 255, 255, 255))
  $g.FillPath($pg, $hl)
  $pg.Dispose(); $hl.Dispose()
}

# 字标：白色 N（圆头折线）+ 右上角四角星。k = 字标边长占画布比例
function Draw-Mark($g, [single]$S, [single]$k, $ink) {
  $m = $S * $k                       # 字标整体外接框
  $ox = ($S - $m) / 2
  $oy = ($S - $m) / 2

  # N 的两竖 + 一斜，留出右上角给星
  $w = $m * 0.74
  $h = $m * 0.60
  $bx = $ox
  $by = $oy + $m * 0.24
  $pen = New-Object System.Drawing.Pen($ink, [single]($m * 0.155))
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pts = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new([single]$bx, [single]($by + $h)),
    [System.Drawing.PointF]::new([single]$bx, [single]$by),
    [System.Drawing.PointF]::new([single]($bx + $w), [single]($by + $h)),
    [System.Drawing.PointF]::new([single]($bx + $w), [single]$by)
  )
  $g.DrawLines($pen, $pts)
  $pen.Dispose()

  # 右上角四角星：idea / think 的意象
  $star = New-StarPath ([single]($ox + $m * 0.93)) ([single]($oy + $m * 0.10)) ([single]($m * 0.20))
  $sb = New-Object System.Drawing.SolidBrush($ink)
  $g.FillPath($sb, $star)
  $sb.Dispose(); $star.Dispose()
}

# 4× 超采样绘制 → 下采样，返回 Bitmap（调用方负责 Dispose/Save）
function New-Canvas([int]$px, [scriptblock]$draw) {
  $ss = 4
  $big = New-Object System.Drawing.Bitmap(($px * $ss), ($px * $ss), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  & $draw $g ([single]($px * $ss))
  $g.Dispose()

  $out = New-Object System.Drawing.Bitmap($px, $px, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($out)
  $g2.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $ia = New-Object System.Drawing.Imaging.ImageAttributes
  $ia.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)
  $rect = New-Object System.Drawing.Rectangle(0, 0, $px, $px)
  $g2.DrawImage($big, $rect, 0, 0, $big.Width, $big.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)
  $g2.Dispose(); $big.Dispose(); $ia.Dispose()
  return $out
}

function Save-Png($bmp, [string]$path) {
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

# ── 1. 自适应图标：底色 + 前景 ───────────────────────────────────────────────
# 密度 → 108dp 画布像素（mdpi=108）
$adaptive = @{ 'ldpi' = 81; 'mdpi' = 108; 'hdpi' = 162; 'xhdpi' = 216; 'xxhdpi' = 324; 'xxxhdpi' = 432 }
$legacy = @{ 'ldpi' = 36; 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }

foreach ($d in $adaptive.Keys) {
  $px = $adaptive[$d]
  $dir = Join-Path $ResRoot "mipmap-$d"

  $bg = New-Canvas $px { param($g, $S) Draw-Backdrop $g $S $BrandTop $BrandBot }
  Save-Png $bg (Join-Path $dir 'ic_launcher_background.png'); $bg.Dispose()

  # 前景：只有白字标，透明底。k=0.78 → 再经 XML 的 16.7% inset 后正落在安全区
  $fg = New-Canvas $px { param($g, $S) Draw-Mark $g $S 0.78 $Ink }
  Save-Png $fg (Join-Path $dir 'ic_launcher_foreground.png'); $fg.Dispose()

  # 旧版方形 / 圆形图标：自带底色 + 遮罩，字标略小（无 inset，撑满整块）
  $lx = $legacy[$d]
  $sq = New-Canvas $lx { param($g, $S)
    Draw-Backdrop $g $S $BrandTop $BrandBot
    Draw-Mark $g $S 0.62 $Ink
  }
  $mask = New-RoundedPath 0 0 $lx $lx ([single]($lx * 0.22))
  $sq2 = New-Object System.Drawing.Bitmap($lx, $lx, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gm = [System.Drawing.Graphics]::FromImage($sq2)
  $gm.Clear([System.Drawing.Color]::Transparent)
  $gm.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $gm.SetClip($mask)
  $gm.DrawImageUnscaled($sq, 0, 0)
  $gm.Dispose(); $mask.Dispose(); $sq.Dispose()
  Save-Png $sq2 (Join-Path $dir 'ic_launcher.png'); $sq2.Dispose()

  $circ = New-Canvas $lx { param($g, $S)
    Draw-Backdrop $g $S $BrandTop $BrandBot
    Draw-Mark $g $S 0.66 $Ink
  }
  $cmask = New-Object System.Drawing.Drawing2D.GraphicsPath
  $cmask.AddEllipse(0, 0, $lx, $lx)
  $rd = New-Object System.Drawing.Bitmap($lx, $lx, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gc = [System.Drawing.Graphics]::FromImage($rd)
  $gc.Clear([System.Drawing.Color]::Transparent)
  $gc.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $gc.SetClip($cmask)
  $gc.DrawImageUnscaled($circ, 0, 0)
  $gc.Dispose(); $cmask.Dispose(); $circ.Dispose()
  Save-Png $rd (Join-Path $dir 'ic_launcher_round.png'); $rd.Dispose()

  Write-Host ("icon {0,-8} adaptive={1}px legacy={2}px" -f $d, $px, $lx)
}

# ── 2. 启动图：沿用现有文件的尺寸逐张覆盖 ──────────────────────────────────
function New-Splash([int]$w, [int]$h, [bool]$night) {
  $ss = 2
  $big = New-Object System.Drawing.Bitmap(($w * $ss), ($h * $ss), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($big)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $W = [single]($w * $ss); $H = [single]($h * $ss)

  $c1 = if ($night) { $NightTop } else { $BrandTop }
  $c2 = if ($night) { $NightBot } else { $BrandBot }
  $rect = New-Object System.Drawing.RectangleF(0, 0, $W, $H)
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $c1, $c2, [single]60)
  $g.FillRectangle($bg, $rect); $bg.Dispose()

  $S = [Math]::Min($W, $H)
  $mark = $S * 0.26
  $cx = $W / 2; $cy = $H * 0.455
  $g.TranslateTransform([single]($cx - $mark / 2), [single]($cy - $mark / 2))
  # 复用一个正方形画布尺寸调用字标绘制
  Draw-Mark $g $mark 1.0 $Ink
  $g.ResetTransform()

  # 字标下方品牌名（与界面标题一致的粗斜体）
  $em = [single]($S * 0.062)
  $font = $null
  foreach ($name in @('Segoe UI', 'Arial', 'Helvetica')) {
    try {
      $font = New-Object System.Drawing.Font($name, $em, ([System.Drawing.FontStyle]::Bold -bor [System.Drawing.FontStyle]::Italic), [System.Drawing.GraphicsUnit]::Pixel)
      break
    } catch { $font = $null }
  }
  if ($font) {
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(242, 255, 255, 255))
    $ty = [single]($cy + $mark * 0.92)
    $g.DrawString('NativeThink', $font, $ink, (New-Object System.Drawing.PointF([single]$cx, $ty)), $fmt)
    $ink.Dispose(); $fmt.Dispose(); $font.Dispose()
  }
  $g.Dispose()

  $out = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g2 = [System.Drawing.Graphics]::FromImage($out)
  $g2.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g2.DrawImage($big, (New-Object System.Drawing.Rectangle(0, 0, $w, $h)), 0, 0, $big.Width, $big.Height, [System.Drawing.GraphicsUnit]::Pixel)
  $g2.Dispose(); $big.Dispose()
  return $out
}

$splashCount = 0
foreach ($dir in Get-ChildItem $ResRoot -Directory -Filter 'drawable*') {
  $files = Get-ChildItem $dir.FullName -File -Filter 'splash.png' -ErrorAction SilentlyContinue
  foreach ($f in $files) {
    $b = [System.IO.File]::ReadAllBytes($f.FullName)
    $w = [int]($b[16] * 16777216 + $b[17] * 65536 + $b[18] * 256 + $b[19])
    $h = [int]($b[20] * 16777216 + $b[21] * 65536 + $b[22] * 256 + $b[23])
    $night = $dir.Name -like '*night*'
    $img = New-Splash $w $h $night
    Save-Png $img $f.FullName; $img.Dispose()
    $splashCount++
  }
}
Write-Host "splash: $splashCount 张已更新"

# ── 3. Web favicon（SVG，同一套字标）────────────────────────────────────────
$favicon = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108" role="img" aria-label="NativeThink">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#14D9A8"/>
      <stop offset="1" stop-color="#00A183"/>
    </linearGradient>
  </defs>
  <rect width="108" height="108" rx="24" fill="url(#bg)"/>
  <g stroke="#fff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M25 82V38l40 44V38"/>
  </g>
  <path d="M85 17l2.1 7.9L95 27l-7.9 2.1L85 37l-2.1-7.9L75 27l7.9-2.1z" fill="#fff"/>
</svg>
'@
Set-Content -Path (Join-Path $RepoRoot 'public/favicon.svg') -Value $favicon -Encoding UTF8
Write-Host 'favicon.svg 已更新'

# ── 4. icon.ico（Electron / Windows）—— ICO 里直接内嵌 PNG ─────────────────
$icoSizes = @(16, 24, 32, 48, 64, 128, 256)
$pngs = @()
foreach ($s in $icoSizes) {
  $bmp = New-Canvas $s { param($g, $S)
    Draw-Backdrop $g $S $BrandTop $BrandBot
    Draw-Mark $g $S 0.62 $Ink
  }
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  $pngs += , @{ size = $s; bytes = $ms.ToArray() }
  $ms.Dispose()
}
$icoPath = Join-Path $RepoRoot 'icon.ico'
$fs = [System.IO.File]::Create($icoPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$pngs.Count)
$offset = 6 + 16 * $pngs.Count
foreach ($p in $pngs) {
  $dim = if ($p.size -ge 256) { 0 } else { $p.size }
  $bw.Write([byte]$dim); $bw.Write([byte]$dim); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32)
  $bw.Write([uint32]$p.bytes.Length); $bw.Write([uint32]$offset)
  $offset += $p.bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p.bytes) }
$bw.Flush(); $bw.Dispose(); $fs.Dispose()
Write-Host ("icon.ico 已更新（{0} 个尺寸）" -f $pngs.Count)

# ── 5. 可选：预览拼图（给设计评审看）────────────────────────────────────────
if ($Preview) {
  $W = 720; $H = 460
  $sheet = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $gs = [System.Drawing.Graphics]::FromImage($sheet)
  $gs.Clear([System.Drawing.Color]::FromArgb(255, 245, 246, 248))
  $gs.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $gs.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

  $big = New-Canvas 288 { param($g, $S)
    $sq = New-RoundedPath 0 0 $S $S ([single]($S * 0.22))
    $g.SetClip($sq)
    Draw-Backdrop $g $S $BrandTop $BrandBot
    Draw-Mark $g $S 0.62 $Ink
  }
  $gs.DrawImage($big, 34, 40, 288, 288)
  $big.Dispose()

  # 自适应图标在启动器里的真实观感：前景缩到 66.7% 再叠在底色上
  $abg = New-Canvas 192 { param($g, $S) Draw-Backdrop $g $S $BrandTop $BrandBot }
  $afg = New-Canvas 192 { param($g, $S) Draw-Mark $g $S 0.78 $Ink }
  $circle = New-Object System.Drawing.Drawing2D.GraphicsPath
  $circle.AddEllipse(0, 0, 192, 192)
  $gs.SetClip($circle, [System.Drawing.Drawing2D.CombineMode]::Replace)
  $gs.DrawImage($abg, 360, 40, 192, 192)
  $inner = [int](192 * 0.667)
  $gs.DrawImage($afg, (360 + (192 - $inner) / 2), (40 + (192 - $inner) / 2), $inner, $inner)
  $gs.ResetClip()
  $abg.Dispose(); $afg.Dispose(); $circle.Dispose()

  foreach ($p in @(@{s = 48; x = 592; y = 60 }, @{s = 72; x = 592; y = 130 }, @{s = 36; x = 600; y = 214 })) {
    $t = New-Canvas $p.s { param($g, $S)
      $sq = New-RoundedPath 0 0 $S $S ([single]($S * 0.22))
      $g.SetClip($sq)
      Draw-Backdrop $g $S $BrandTop $BrandBot
      Draw-Mark $g $S 0.62 $Ink
    }
    $gs.DrawImage($t, $p.x, $p.y, $p.s, $p.s); $t.Dispose()
  }

  # 启动图缩略
  $sp = New-Splash 240 360 $false
  $gs.DrawImage($sp, 360, 252, 160, 240); $sp.Dispose()

  $font = New-Object System.Drawing.Font('Segoe UI', 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 90, 96, 106))
  foreach ($t in @(
      @{ s = '方图 288'; x = 34; y = 340 },
      @{ s = '自适应（圆形遮罩后的实际观感）'; x = 360; y = 340 },
      @{ s = '48 / 72 / 36 px'; x = 592; y = 340 },
      @{ s = '启动图'; x = 360; y = 500 })) {
    $gs.DrawString($t.s, $font, $brush, [single]$t.x, [single]$t.y)
  }
  $font.Dispose(); $brush.Dispose(); $gs.Dispose()
  Save-Png $sheet $Preview; $sheet.Dispose()
  Write-Host "preview → $Preview"
}
