using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace CrtMonitor;

internal static class Program
{
    private const uint ES_CONTINUOUS = 0x80000000;
    private const uint ES_DISPLAY_REQUIRED = 0x00000002;

    [DllImport("kernel32.dll")]
    private static extern uint SetThreadExecutionState(uint esFlags);

    [STAThread]
    private static void Main()
    {
        // 副屏常亮，不让系统息屏
        SetThreadExecutionState(ES_CONTINUOUS | ES_DISPLAY_REQUIRED);

        var cfg = ConfigStore.Load();
        Log($"start v{typeof(Program).Assembly.GetName().Version} elevated={IsElevated()}");

        TryRelaunchElevatedForLhm(cfg);
        if (cfg.Autostart is { } autostart) ApplyAutostart(autostart);

        Application.ThreadException += (_, e) => Log($"UI: {e.Exception}");
        AppDomain.CurrentDomain.UnhandledException += (_, e) => Log($"FATAL: {e.ExceptionObject}");
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);

        ApplicationConfiguration.Initialize();
        using var form = new MainForm(cfg);
        form.FormClosed += (_, e) => Log($"closed: {e.CloseReason}");
        Application.Run(form);
        Log("exit");
    }

    public static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    /// <summary>LHM 需要管理员：未提权且用户启用了 lhm 时弹 UAC 重启自身；用户拒绝则降级运行（无传感器）。</summary>
    private static void TryRelaunchElevatedForLhm(Config cfg)
    {
        if (!cfg.Lhm || IsElevated()) return;
        try
        {
            var psi = new ProcessStartInfo(Environment.ProcessPath ?? Application.ExecutablePath)
            {
                UseShellExecute = true,
                Verb = "runas",
                WorkingDirectory = Environment.CurrentDirectory,
            };
            using var p = Process.Start(psi);
            if (p is not null)
            {
                Log("relaunched elevated for LHM");
                Environment.Exit(0);
            }
        }
        catch (Exception ex)
        {
            Log($"elevation declined, running without sensors: {ex.Message}");
        }
    }

    /// <summary>HKCU Run 自启动（免管理员）。</summary>
    public static void ApplyAutostart(bool enable)
    {
        try
        {
            using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Run", writable: true);
            if (key is null) return;
            if (enable)
                key.SetValue("CrtMonitor", $"\"{Environment.ProcessPath}\"");
            else
                key.DeleteValue("CrtMonitor", throwOnMissingValue: false);
        }
        catch (Exception ex)
        {
            Log($"autostart registry failed: {ex.Message}");
        }
    }

    public static void Log(string message)
    {
        try
        {
            File.AppendAllText(
                Path.Combine(AppContext.BaseDirectory, "crt.log"),
                $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}{Environment.NewLine}");
        }
        catch { /* 日志失败就放弃 */ }
    }
}
