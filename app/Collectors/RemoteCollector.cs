using System.Text.Json;

namespace CrtMonitor.Collectors;

/// <summary>远程机器指标：拉取对端 --serve 端点（http://host:9123/metrics/），
/// 解析同一套协议。age_ms = 距最近一次成功拉取的毫秒数（前端 >10s 显示离线）。</summary>
public sealed class RemoteCollector : ICollector
{
    private sealed class Slot
    {
        public RemoteDto Dto = new();
        public bool InFlight;
        public DateTime Next = DateTime.MinValue;
        public long LastOkMs;
    }

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(3) };

    private readonly List<RemoteConfig> _remotes;
    private readonly Dictionary<string, Slot> _state = new();

    public RemoteCollector(List<RemoteConfig>? remotes)
    {
        _remotes = remotes ?? new List<RemoteConfig>();
    }

    public void Poll(TickDto tick)
    {
        var results = new List<RemoteDto>();
        foreach (var rc in _remotes)
        {
            if (string.IsNullOrWhiteSpace(rc.Name) || string.IsNullOrWhiteSpace(rc.Url)) continue;
            var slot = _state.TryGetValue(rc.Name, out var s)
                ? s
                : _state[rc.Name] = new Slot { Dto = new RemoteDto { Name = rc.Name } };

            if (!slot.InFlight && DateTime.UtcNow >= slot.Next)
            {
                slot.InFlight = true;
                slot.Next = DateTime.UtcNow.AddSeconds(2);
                Task.Run(() => FetchOne(rc, slot));
            }

            long age = slot.LastOkMs == 0 ? long.MaxValue : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - slot.LastOkMs;
            var d = slot.Dto;
            results.Add(new RemoteDto
            {
                Name = d.Name,
                Cpu = d.Cpu,
                MemPct = d.MemPct,
                MemUsed = d.MemUsed,
                MemTotal = d.MemTotal,
                RxBps = d.RxBps,
                TxBps = d.TxBps,
                AgeMs = age,
            });
        }
        tick.Metrics.Remotes = results;
    }

    private async Task FetchOne(RemoteConfig rc, Slot slot)
    {
        try
        {
            using var doc = JsonDocument.Parse(await Http.GetStringAsync(rc.Url));
            var r = doc.RootElement.GetProperty("metrics");
            var cpu = r.GetProperty("cpu");
            var mem = r.GetProperty("mem");
            var net = r.GetProperty("net");

            ulong total = mem.GetProperty("total_b").GetUInt64();
            ulong used = mem.GetProperty("used_b").GetUInt64();

            slot.Dto = new RemoteDto
            {
                Name = rc.Name,
                Cpu = cpu.GetProperty("usage").GetDouble(),
                MemUsed = used,
                MemTotal = total,
                MemPct = total > 0 ? Math.Round(used * 100.0 / total, 1) : 0,
                RxBps = net.GetProperty("rx_bps").GetDouble(),
                TxBps = net.GetProperty("tx_bps").GetDouble(),
                AgeMs = 0,
            };
            slot.LastOkMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
        catch
        {
            // 拉取失败：保留旧值，age 自然增长，前端显示离线
        }
        finally
        {
            slot.InFlight = false;
        }
    }
}
