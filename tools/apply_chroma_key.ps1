param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [ValidateSet("Green", "Magenta")][string]$KeyColor = "Green",
  [int]$OutputSize = 1024
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($InputPath)
$dst = [System.Drawing.Bitmap]::new($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

for ($y = 0; $y -lt $src.Height; $y++) {
  for ($x = 0; $x -lt $src.Width; $x++) {
    $c = $src.GetPixel($x, $y)
    $isGreenKey = $c.G -gt 130 -and $c.G -gt ($c.R * 1.35) -and $c.G -gt ($c.B * 1.35)
    $isMagentaKey = $c.R -gt 130 -and $c.B -gt 130 -and $c.R -gt ($c.G * 1.35) -and $c.B -gt ($c.G * 1.35)
    $isKey = if ($KeyColor -eq "Magenta") { $isMagentaKey } else { $isGreenKey }
    if ($isKey) {
      $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, $c.R, $c.G, $c.B))
    } else {
      $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $c.R, $c.G, $c.B))
    }
  }
}

$resized = [System.Drawing.Bitmap]::new($OutputSize, $OutputSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($resized)
$g.Clear([System.Drawing.Color]::Transparent)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($dst, 0, 0, $OutputSize, $OutputSize)
$g.Dispose()

$resized.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$resized.Dispose()
$dst.Dispose()
$src.Dispose()
