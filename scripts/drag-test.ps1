param([string]$Out = "C:\Users\fangb\Documents\zcode\crt\dragtest.png")

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class DragHelper {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }

  public static IntPtr FindByPid(uint pid) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((hwnd, lp) => {
      uint wpid; GetWindowThreadProcessId(hwnd, out wpid);
      if (wpid == pid && IsWindowVisible(hwnd) && found == IntPtr.Zero) { found = hwnd; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr lp);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hwnd, IntPtr a, int x, int y, int w, int h, uint f);
}
"@

$proc = Get-Process CrtMonitor | Select-Object -First 1
if (-not $proc) { Write-Output "APP_NOT_FOUND"; exit 1 }
$h = [DragHelper]::FindByPid([uint32]$proc.Id)

# 先窗口化到 (60,60) 900x560
[DragHelper]::SetWindowPos($h, [IntPtr]::Zero, 60, 60, 900, 560, 0x0040) | Out-Null
Start-Sleep -Milliseconds 500

$rect = New-Object DragHelper+RECT
[DragHelper]::GetWindowRect($h, [ref]$rect) | Out-Null
Write-Output ("BEFORE L=" + $rect.L + " T=" + $rect.T)

# 按住顶栏（避开 padding，取 35px 处）拖动 +200/+150
$grabX = $rect.L + 400
$grabY = $rect.T + 35
[DragHelper]::SetCursorPos($grabX, $grabY) | Out-Null
Start-Sleep -Milliseconds 200
[DragHelper]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)  # down
Start-Sleep -Milliseconds 150
foreach ($i in 1..10) {
  [DragHelper]::mouse_event(1, 20, 15, 0, [UIntPtr]::Zero)  # move relative
  Start-Sleep -Milliseconds 60
}
Start-Sleep -Milliseconds 200
[DragHelper]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)  # up
Start-Sleep -Milliseconds 500

[DragHelper]::GetWindowRect($h, [ref]$rect) | Out-Null
Write-Output ("AFTER  L=" + $rect.L + " T=" + $rect.T)

Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
$bmp.Save($Out)
$g.Dispose(); $bmp.Dispose()
Write-Output "DONE"
