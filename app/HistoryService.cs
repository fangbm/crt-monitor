using System.Text.Json;

namespace CrtMonitor;

/// <summary>历史数据：按分钟聚合 cpu/mem/net，内存环形保留 24h，每 5 分钟落盘 history.json。</summary>
public sealed class HistoryService : IDisposable
{
    private const int KeepMinutes = 24 * 60;
    private static readonly string DataPath = Path.Combine(AppContext.BaseDirectory, "history.json");

    private readonly Dictionary<long, HistoryPointDto> _minutes = new();
    private readonly Dictionary<long, HistoryPointDto> _minutes10 = new();
    private Dictionary<string, double[]> _traffic = new(); // key: yyyy-MM-dd, value: [rx, tx]
    private DateTime _lastSaveUtc = DateTime.MinValue;
    private long _lastTs;
    private readonly object _gate = new();

    public HistoryService()
    {
        Load();
    }

    public void Add(TickDto tick)
    {
        lock (_gate)
        {
            long key = tick.Ts / 60000 * 60;
            double memPct = tick.Metrics.Mem.TotalB > 0
                ? tick.Metrics.Mem.UsedB * 100.0 / tick.Metrics.Mem.TotalB : 0;

            if (!_minutes.TryGetValue(key, out var p))
                _minutes[key] = p = new HistoryPointDto { T = key };

            p.CpuMax = Math.Max(p.CpuMax, tick.Metrics.Cpu.Usage);
            // 分钟内做增量平均
            p.Cpu = p.Cpu <= 0 && p.Mem <= 0 && p.Rx <= 0 && p.Tx <= 0
                ? tick.Metrics.Cpu.Usage
                : (p.Cpu + tick.Metrics.Cpu.Usage) / 2;
            p.Mem = p.Mem <= 0 ? memPct : (p.Mem + memPct) / 2;
            p.Rx = Math.Max(p.Rx, tick.Metrics.Net.RxBps);
            p.Tx = Math.Max(p.Tx, tick.Metrics.Net.TxBps);

            // 环形裁剪
            if (_minutes.Count > KeepMinutes)
            {
                var cutoff = key - KeepMinutes * 60L;
                foreach (var k in _minutes.Keys.Where(k => k < cutoff).ToList())
                    _minutes.Remove(k);
            }

            // 今日流量积分：bps × 相邻 tick 间隔秒数
            if (_lastTs > 0 && tick.Ts > _lastTs)
            {
                double dtSec = (tick.Ts - _lastTs) / 1000.0;
                if (dtSec is > 0 and < 30)
                {
                    string day = DateTimeOffset.FromUnixTimeMilliseconds(tick.Ts).LocalDateTime.ToString("yyyy-MM-dd");
                    if (!_traffic.TryGetValue(day, out var v))
                        _traffic[day] = v = new double[2];
                    v[0] += tick.Metrics.Net.RxBps * dtSec;
                    v[1] += tick.Metrics.Net.TxBps * dtSec;
                    // 只保留近 7 天
                    if (_traffic.Count > 7)
                    {
                        foreach (var k in _traffic.Keys.OrderBy(k => k).Take(_traffic.Count - 7).ToList())
                            _traffic.Remove(k);
                    }
                }
            }
            _lastTs = tick.Ts;

            // 10 分钟降采样（7 天，1008 点）：滑动平均
            long key10 = tick.Ts / 600_000 * 600;
            if (!_minutes10.TryGetValue(key10, out var p10))
                _minutes10[key10] = p10 = new HistoryPointDto { T = key10 };
            p10.CpuMax = Math.Max(p10.CpuMax, tick.Metrics.Cpu.Usage);
            p10.Cpu = p10.Cpu <= 0 && p10.Mem <= 0 && p10.Rx <= 0 && p10.Tx <= 0
                ? tick.Metrics.Cpu.Usage : (p10.Cpu + tick.Metrics.Cpu.Usage) / 2;
            p10.Mem = p10.Mem <= 0 ? memPct : (p10.Mem + memPct) / 2;
            p10.Rx = Math.Max(p10.Rx, tick.Metrics.Net.RxBps);
            p10.Tx = Math.Max(p10.Tx, tick.Metrics.Net.TxBps);
            if (_minutes10.Count > 7 * 144)
            {
                var cutoff10 = key10 - 7L * 144 * 600;
                foreach (var k in _minutes10.Keys.Where(k => k < cutoff10).ToList())
                    _minutes10.Remove(k);
            }

            if (DateTime.UtcNow - _lastSaveUtc > TimeSpan.FromMinutes(5))
            {
                _lastSaveUtc = DateTime.UtcNow;
                Save();
            }
        }
    }

    public HistoryDto Snapshot()
    {
        lock (_gate)
        {
            var points = _minutes.Values.OrderBy(p => p.T).ToList();
            var dto = new HistoryDto();
            string today = DateTime.Now.ToString("yyyy-MM-dd");
            var todayTraffic = _traffic.GetValueOrDefault(today, new double[2]);
            if (points.Count > 0)
            {
                dto.Stats = new HistoryStatsDto
                {
                    CpuMax = Math.Round(points.Max(p => p.CpuMax), 1),
                    CpuAvg = Math.Round(points.Average(p => p.Cpu), 1),
                    MemMax = Math.Round(points.Max(p => p.Mem), 1),
                    RxMax = Math.Round(points.Max(p => p.Rx), 0),
                    TxMax = Math.Round(points.Max(p => p.Tx), 0),
                    TodayRx = Math.Round(todayTraffic[0]),
                    TodayTx = Math.Round(todayTraffic[1]),
                };
            }
            else
            {
                dto.Stats.TodayRx = Math.Round(todayTraffic[0]);
                dto.Stats.TodayTx = Math.Round(todayTraffic[1]);
            }
            dto.Points = points;
            dto.Points10m = _minutes10.Values.OrderBy(p => p.T).ToList();
            return dto;
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(DataPath)) return;
            using var doc = JsonDocument.Parse(File.ReadAllText(DataPath));
            var root = doc.RootElement;
            long cutoff = DateTimeOffset.UtcNow.ToUnixTimeSeconds() - KeepMinutes * 60L;
            if (root.TryGetProperty("points", out var pts))
            {
                var list = JsonSerializer.Deserialize<List<HistoryPointDto>>(pts.GetRawText(), ConfigJson.Web) ?? new();
                foreach (var p in list.Where(p => p.T >= cutoff))
                    _minutes[p.T] = p;
            }
            if (root.TryGetProperty("traffic", out var tf))
            {
                _traffic = JsonSerializer.Deserialize<Dictionary<string, double[]>>(tf.GetRawText(), ConfigJson.Web) ?? new();
            }
            if (root.TryGetProperty("points10m", out var p10el))
            {
                var list10 = JsonSerializer.Deserialize<List<HistoryPointDto>>(p10el.GetRawText(), ConfigJson.Web) ?? new();
                foreach (var p in list10)
                    _minutes10[p.T] = p;
            }
            Program.Log($"history loaded: {_minutes.Count} minutes");
        }
        catch (Exception ex)
        {
            Program.Log($"history load failed: {ex.Message}");
        }
    }

    private void Save()
    {
        try
        {
            var payload = new Dictionary<string, object?>
            {
                ["points"] = Snapshot().Points,
                ["points10m"] = Snapshot().Points10m,
                ["traffic"] = _traffic,
            };
            File.WriteAllText(DataPath, JsonSerializer.Serialize(payload, ConfigJson.Web));
        }
        catch (Exception ex)
        {
            Program.Log($"history save failed: {ex.Message}");
        }
    }

    public void Dispose() => Save();
}
