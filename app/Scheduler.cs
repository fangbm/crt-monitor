using System.Text.Json;
using CrtMonitor.Collectors;

namespace CrtMonitor;

/// <summary>统一 tick：依次 poll 各 Collector → 告警评估 → 历史聚合 → 序列化协议 JSON → 推给 WebView2。</summary>
public sealed class Scheduler : IDisposable
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    private readonly List<ICollector> _collectors;
    private readonly AlertEvaluator _alerts;
    private readonly HistoryService _history = new();
    private int _tickCount;

    /// <summary>最近一轮的 CPU 总占用（托盘图标用）。</summary>
    public double? LastCpuPercent { get; private set; }

    public Scheduler(Config cfg) : this(cfg, pluginCollectors: null, notify: null) { }

    public Scheduler(Config cfg, List<ICollector>? pluginCollectors, Action<string>? notify = null)
    {
        _collectors = new List<ICollector>
        {
            new CpuMemCollector(),
            new DiskCollector(),
            new NetCollector(),
            new ProcessCollector(),
            new WeatherCollector(cfg.Weather),
        };
        if (cfg.Lhm)
            _collectors.Add(new LhmCollector(enabled: true));
        if (pluginCollectors is { Count: > 0 })
            _collectors.AddRange(pluginCollectors);

        _alerts = new AlertEvaluator(cfg.Alerts, cfg.AlertSound, notify);
    }

    /// <summary>采集一轮并返回 JSON（null 表示本轮失败）。调用方决定推送到哪里。</summary>
    public string? CollectJson()
    {
        try
        {
            var tick = new TickDto { Ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };
            foreach (var c in _collectors)
                c.Poll(tick);
            _alerts.Evaluate(tick);
            _history.Add(tick);
            LastCpuPercent = tick.Metrics.Cpu.Usage;
            _tickCount++;
            return JsonSerializer.Serialize(tick, JsonOpts);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>首拍与之后每 60 拍推一次历史（分钟级数据，秒推浪费）。</summary>
    public bool ShouldPushHistory() => _tickCount == 1 || _tickCount % 60 == 0;

    public string? HistoryJson()
    {
        try { return JsonSerializer.Serialize(_history.Snapshot(), JsonOpts); }
        catch { return null; }
    }

    public void Dispose() => _history.Dispose();
}
