using System.Net.NetworkInformation;

namespace CrtMonitor.Collectors;

/// <summary>Ping 延迟/丢包：每目标一个后台循环，60 次环形缓存。
/// config: "pings": [{"name":"外网","host":"223.5.5.5","interval_sec":2}]</summary>
public sealed class PingCollector : ICollector
{
    private const int Keep = 60;

    private sealed class Target
    {
        public required string Name;
        public required string Host;
        public int IntervalSec = 2;
        public readonly object Gate = new();
        public readonly List<double> Series = new(); // -1 = 丢包
        public bool Started;
    }

    private readonly List<Target> _targets = new();

    public PingCollector(List<PingConfig>? pings)
    {
        foreach (var p in pings ?? new List<PingConfig>())
        {
            if (string.IsNullOrWhiteSpace(p.Name) || string.IsNullOrWhiteSpace(p.Host)) continue;
            _targets.Add(new Target { Name = p.Name, Host = p.Host, IntervalSec = Math.Max(1, p.IntervalSec) });
        }
    }

    public void Poll(TickDto tick)
    {
        var results = new List<PingDto>();
        foreach (var t in _targets)
        {
            List<double> series;
            lock (t.Gate)
            {
                if (!t.Started)
                {
                    t.Started = true;
                    Task.Run(() => Loop(t));
                }
                series = new List<double>(t.Series); // 循环线程在写，必须快照
            }
            var last = series.Count > 0 ? series[^1] : -1;
            var window = series.Skip(Math.Max(0, series.Count - 30)).ToList();
            double lost = window.Count > 0 ? window.Count(v => v < 0) * 100.0 / window.Count : 0;
            results.Add(new PingDto
            {
                Name = t.Name,
                Ms = Math.Round(last, 0),
                LostPct = Math.Round(lost, 0),
                Series = series,
            });
        }
        tick.Metrics.Pings = results;
    }

    private async Task Loop(Target t)
    {
        using var ping = new Ping();
        while (true)
        {
            double ms = -1;
            try
            {
                var reply = await ping.SendPingAsync(t.Host, 2000);
                if (reply.Status == IPStatus.Success) ms = reply.RoundtripTime;
            }
            catch { /* 目标不可达按丢包 */ }

            lock (t.Gate)
            {
                t.Series.Add(ms);
                if (t.Series.Count > Keep) t.Series.RemoveAt(0);
            }
            await Task.Delay(t.IntervalSec * 1000);
        }
    }
}
