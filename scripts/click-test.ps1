Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseClicker {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, int dx, int dy, uint data, UIntPtr extra);
}
"@

[MouseClicker]::SetCursorPos($args[0], $args[1]) | Out-Null
Start-Sleep -Milliseconds 300
[MouseClicker]::mouse_event(2, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[MouseClicker]::mouse_event(4, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 600
$ws = New-Object -ComObject WScript.Shell
$ws.SendKeys("t")
Start-Sleep -Milliseconds 1500
Write-Output "DONE"
