Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot

function Draw-RoundedRectangle {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Brush]$Brush,
    [float]$X,
    [float]$Y,
    [float]$Width,
    [float]$Height,
    [float]$Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2

  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  $Graphics.FillPath($Brush, $path)
  $path.Dispose()
}

function Draw-Icon([int]$size, [string]$path) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $size / 128.0
  $backgroundBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#4338ca'))
  $whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $orangeBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f05a28'))
  $yellowBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f5b942'))

  Draw-RoundedRectangle -Graphics $graphics -Brush $backgroundBrush -X (3 * $scale) -Y (3 * $scale) -Width (122 * $scale) -Height (122 * $scale) -Radius (27 * $scale)
  Draw-RoundedRectangle -Graphics $graphics -Brush $whiteBrush -X (20 * $scale) -Y (26 * $scale) -Width (88 * $scale) -Height (76 * $scale) -Radius (12 * $scale)

  $dividerPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#dfe1ee'), 6 * $scale)
  $graphics.DrawLine($dividerPen, 20 * $scale, 41 * $scale, 108 * $scale, 41 * $scale)
  $graphics.FillEllipse($orangeBrush, 28 * $scale, 31 * $scale, 6 * $scale, 6 * $scale)
  $graphics.FillEllipse($yellowBrush, 38 * $scale, 31 * $scale, 6 * $scale, 6 * $scale)

  $codePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml('#f05a28'), 7 * $scale)
  $codePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $codePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $codePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $graphics.DrawLines($codePen, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(53 * $scale, 57 * $scale),
    [System.Drawing.PointF]::new(41 * $scale, 68 * $scale),
    [System.Drawing.PointF]::new(53 * $scale, 79 * $scale)
  ))
  $graphics.DrawLines($codePen, [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(75 * $scale, 57 * $scale),
    [System.Drawing.PointF]::new(87 * $scale, 68 * $scale),
    [System.Drawing.PointF]::new(75 * $scale, 79 * $scale)
  ))
  $graphics.DrawLine($codePen, 68 * $scale, 52 * $scale, 59 * $scale, 84 * $scale)

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $codePen.Dispose()
  $dividerPen.Dispose()
  $yellowBrush.Dispose()
  $orangeBrush.Dispose()
  $whiteBrush.Dispose()
  $backgroundBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Draw-Icon 16 (Join-Path $root 'icon16.png')
Draw-Icon 48 (Join-Path $root 'icon48.png')
Draw-Icon 128 (Join-Path $root 'icon128.png')
