param(
  [int]$W = 900,
  [int]$H = 560,
  [string]$Out = "C:\Users\fangb\Documents\zcode\crt\t2.png"
)

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class Win32Resizer {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

  public static IntPtr FindByPid(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hwnd, lp) => {
      uint wpid;
      GetWindowThreadProcessId(hwnd, out wpid);
      if (wpid == pid && IsWindowVisible(hwnd) && found == IntPtr.Zero) { found = hwnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$proc = Get-Process CrtMonitor -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) { Write-Output "WINDOW_NOT_FOUND"; exit 1 }
$h = [Win32Resizer]::FindByPid([uint32]$proc.Id)
if ($h -eq [IntPtr]::Zero) { Write-Output "WINDOW_NOT_FOUND"; exit 1 }

$ok = [Win32Resizer]::SetWindowPos($h, [IntPtr]::Zero, 80, 80, $W, $H, 0x0040)
Write-Output "RESIZED=$ok"

Start-Sleep -Seconds 2
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save($Out)
$g.Dispose()
$bmp.Dispose()
Write-Output "SHOT_OK"
