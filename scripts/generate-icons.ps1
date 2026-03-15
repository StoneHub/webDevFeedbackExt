Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot

function New-Brush([int]$size) {
  $start = [System.Drawing.Point]::new(0, 0)
  $end = [System.Drawing.Point]::new($size, $size)
  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $start,
    $end,
    [System.Drawing.ColorTranslator]::FromHtml('#667eea'),
    [System.Drawing.ColorTranslator]::FromHtml('#764ba2')
  )
  return $brush
}

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

  $backgroundBrush = New-Brush $size
  $graphics.FillRectangle($backgroundBrush, 0, 0, $size, $size)

  $whiteBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#667eea'))

  $bubbleX = $size * 0.22
  $bubbleY = $size * 0.18
  $bubbleWidth = $size * 0.58
  $bubbleHeight = $size * 0.44
  $radius = [Math]::Max(2, $size * 0.08)

  Draw-RoundedRectangle -Graphics $graphics -Brush $whiteBrush -X $bubbleX -Y $bubbleY -Width $bubbleWidth -Height $bubbleHeight -Radius $radius

  $tail = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $tail.StartFigure()
  $tail.AddLine($bubbleX + ($bubbleWidth * 0.46), $bubbleY + $bubbleHeight, $bubbleX + ($bubbleWidth * 0.34), $bubbleY + $bubbleHeight + ($size * 0.15))
  $tail.AddLine($bubbleX + ($bubbleWidth * 0.34), $bubbleY + $bubbleHeight + ($size * 0.15), $bubbleX + ($bubbleWidth * 0.34), $bubbleY + $bubbleHeight)
  $tail.CloseFigure()
  $graphics.FillPath($whiteBrush, $tail)
  $tail.Dispose()

  if ($size -ge 48) {
    $cursor = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $cursorX = $bubbleX + ($bubbleWidth * 0.32)
    $cursorY = $bubbleY + ($bubbleHeight * 0.28)
    $cursorSize = $size * 0.18

    $cursor.StartFigure()
    $cursor.AddLine($cursorX, $cursorY, $cursorX, $cursorY + $cursorSize)
    $cursor.AddLine($cursorX, $cursorY + $cursorSize, $cursorX + ($cursorSize * 0.38), $cursorY + ($cursorSize * 0.68))
    $cursor.AddLine($cursorX + ($cursorSize * 0.38), $cursorY + ($cursorSize * 0.68), $cursorX + ($cursorSize * 0.55), $cursorY + $cursorSize)
    $cursor.AddLine($cursorX + ($cursorSize * 0.55), $cursorY + $cursorSize, $cursorX + ($cursorSize * 0.47), $cursorY + ($cursorSize * 0.58))
    $cursor.AddLine($cursorX + ($cursorSize * 0.47), $cursorY + ($cursorSize * 0.58), $cursorX + $cursorSize, $cursorY + ($cursorSize * 0.5))
    $cursor.CloseFigure()

    $graphics.FillPath($accentBrush, $cursor)
    $cursor.Dispose()
  }

  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)

  $accentBrush.Dispose()
  $whiteBrush.Dispose()
  $backgroundBrush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Draw-Icon 16 (Join-Path $root 'icon16.png')
Draw-Icon 48 (Join-Path $root 'icon48.png')
Draw-Icon 128 (Join-Path $root 'icon128.png')
