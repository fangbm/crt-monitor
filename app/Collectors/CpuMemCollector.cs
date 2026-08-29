using System.Runtime.InteropServices;

namespace CrtMonitor.Collectors;

/// <summary>CPU 每核/总占用、实时频率、内存与交换、运行时间、主机静态信息、开机统计。</summary>
public sealed class CpuMemCollector : ICollector
{
    [DllImport("kernel32.dll")]
    private static extern ulong GetTickCount64();

    private long[] _prevIdle = Array.Empty<long>();
    private long[] _prevBusy = Array.Empty<long>();
    private HostDto? _host;
    private long? _lastShutdown;

    public void Poll(TickDto tick)
    {
        PollCpu(tick);
        PollMem(tick);
        // 系统开机时长（不是本进程运行时长）
        long uptimeSec = (long)(GetTickCount64() / 1000);
        tick.UptimeSec = uptimeSec;
        tick.Metrics.Boot = new BootDto
        {
            BootedAt = DateTimeOffset.Now.ToUnixTimeSeconds() - uptimeSec,
            LastShutdown = GetLastShutdown(),
        };
        tick.Host = GetHost(tick.Host);
    }

    /// <summary>上次正常关机时间：HKLM\...\Windows\ShutdownTime（FILETIME），读一次缓存。</summary>
    private long GetLastShutdown()
    {
        if (_lastShutdown.HasValue) return _lastShutdown.Value;
        _lastShutdown = 0;
        try
        {
            var v = Microsoft.Win32.Registry.GetValue(
                @"HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Control\Windows", "ShutdownTime", null);
            if (v is long filetime && filetime > 0)
            {
                var dt = DateTime.FromFileTime(filetime);
                _lastShutdown = new DateTimeOffset(dt.ToUniversalTime()).ToUnixTimeSeconds();
            }
        }
        catch { /* 读不到就 0（前端显示未知） */ }
        return _lastShutdown.Value;
    }

    private void PollCpu(TickDto tick)
    {
        var (idle, busy) = NativeMethods.QueryProcessorTimes();
        if (idle.Length == 0) return;

        var cores = new List<double>(idle.Length);
        double sum = 0;
        for (int i = 0; i < idle.Length; i++)
        {
            double usage = 0;
            if (_prevIdle.Length == idle.Length)
            {
                long dIdle = idle[i] - _prevIdle[i];
                long dBusy = busy[i] - _prevBusy[i];
                if (dIdle + dBusy > 0) usage = 100.0 * dBusy / (dIdle + dBusy);
            }
            cores.Add(Math.Round(usage, 1));
            sum += usage;
        }
        _prevIdle = idle;
        _prevBusy = busy;

        var freqs = NativeMethods.QueryCoreFrequencies();
        tick.Metrics.Cpu = new CpuDto
        {
            Usage = Math.Round(sum / idle.Length, 1),
            Cores = cores,
            FreqMhz = freqs.Length > 0 ? freqs.Max() : null,
        };
    }

    private static void PollMem(TickDto tick)
    {
        var (total, avail, swapTotal, swapAvail) = NativeMethods.QueryMemory();
        tick.Metrics.Mem = new MemDto
        {
            TotalB = total,
            UsedB = total > avail ? total - avail : 0,
            SwapTotalB = swapTotal,
            SwapUsedB = swapTotal > swapAvail ? swapTotal - swapAvail : 0,
        };
    }

    private HostDto GetHost(HostDto fallback)
    {
        if (_host != null) return _host;
        _host = new HostDto
        {
            Name = Environment.MachineName,
            Os = OsDisplayName(),
            CpuModel = Registry.GetString(
                @"HARDWARE\DESCRIPTION\System\CentralProcessor\0", "ProcessorNameString") ?? "Unknown CPU",
            CoreCount = Environment.ProcessorCount,
        };
        return _host;
    }

    private static string OsDisplayName()
    {
        string displayVersion = Registry.GetString(
            @"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "DisplayVersion") ?? "";
        var v = Environment.OSVersion.Version;
        return $"Windows build {v.Build}{(displayVersion.Length > 0 ? " " + displayVersion : "")}";
    }
}

file static class Registry
{
    public static string? GetString(string subKey, string value)
    {
        try { return Microsoft.Win32.Registry.GetValue($@"HKEY_LOCAL_MACHINE\{subKey}", value, null) as string; }
        catch { return null; }
    }
}
