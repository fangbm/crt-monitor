param([string]$Keys = "e", [string]$Out = "C:\Users\fangb\Documents\zcode\crt\cm.png")

$proc = Get-Process CrtMonitor -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "APP_NOT_FOUND"; exit 1 }

$shell = New-Object -ComObject WScript.Shell
$ok = $shell.AppActivate($proc.Id)
Write-Output "ACTIVATE=$ok"
Start-Sleep -Milliseconds 400

foreach ($k in $Keys.ToCharArray()) {
  $shell.SendKeys([string]$k)
  Start-Sleep -Milliseconds 600
}
Start-Sleep -Milliseconds 800

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save($Out)
$g.Dispose()
$bmp.Dispose()
Write-Output "SHOT_OK"
