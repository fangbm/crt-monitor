using System.Runtime.InteropServices;
using System.Text.Json;

namespace CrtMonitor;

/// <summary>告警评估：条件持续 Seconds 秒触发，冷却 Cooldown 秒。
/// 触发时：写入 tick（横幅）+ 历史记录（内存+alerts.json 持久化）+ 可选蜂鸣 + 气泡通知回调。</summary>
public sealed class AlertEvaluator
{
    private const int KeepEntries = 30;
    private static readonly string StorePath = Path.Combine(AppContext.BaseDirectory, "alerts.json");

    private readonly List<AlertRule> _rules;
    private readonly bool _sound;
    private readonly Action<string>? _notify;

    [DllImport("kernel32.dll")]
    private static extern bool Beep(uint frequency, uint duration);

    private sealed record State(DateTime? Since, DateTime LastFire);
    private readonly Dictionary<int, State> _state = new();

    private List<AlertEntryDto> _history = new();
    private long _lastHistoryTs;

    public AlertEvaluator(List<AlertRule>? rules, bool sound, Action<string>? notify)
    {
        _rules = rules ?? new List<AlertRule>();
        _sound = sound;
        _notify = notify;
        Load();
    }

    public void Evaluate(TickDto tick)
    {
        var now = DateTime.UtcNow;
        var alerts = new List<string>();

        for (int i = 0; i < _rules.Count; i++)
        {
            var rule = _rules[i];
            if (!TryGetMetric(tick, rule.Metric, out double current))
                continue;
            bool hit = rule.Op switch
            {
                ">" => current > rule.Value,
                "<" => current < rule.Value,
                _ => false,
            };

            var st = _state.GetValueOrDefault(i, new State(null, DateTime.MinValue));
            if (!hit)
            {
                _state[i] = new State(null, st.LastFire);
                continue;
            }

            var since = st.Since ?? now;
            if ((now - since).TotalSeconds >= rule.Seconds && (now - st.LastFire).TotalSeconds >= rule.Cooldown)
            {
                string label = rule.Label ?? rule.Metric;
                string msg = $"{label} {rule.Op} {FormatValue(rule.Metric, rule.Value)} (now {FormatValue(rule.Metric, current)})";
                alerts.Add(msg);
                Program.Log($"ALERT: {msg}");
                if (_sound) Beep(880, 300);
                _notify?.Invoke(msg);
                _history.Insert(0, new AlertEntryDto { Ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), Msg = msg });
                if (_history.Count > KeepEntries) _history.RemoveAt(_history.Count);
                Save();
                _state[i] = new State(since, now);
            }
            else
            {
                _state[i] = new State(since, st.LastFire);
            }
        }
        tick.Metrics.Alerts = alerts;
        if (_history.Count > 0 && _history[0].Ts != _lastHistoryTs)
        {
            tick.Metrics.AlertHistory = _history;
            _lastHistoryTs = _history[0].Ts;
        }
    }

    private static string FormatValue(string metric, double v) => metric switch
    {
        "net.rx_bps" or "net.tx_bps" => $"{v / 1_000_000:F1}MB/s",
        _ when metric.EndsWith("_pct") || metric == "cpu.usage" => $"{v:F0}%",
        _ => v.ToString("F0"),
    };

    private static bool TryGetMetric(TickDto tick, string path, out double value)
    {
        value = 0;
        var parts = path.Split('.');
        try
        {
            if (parts.Length == 2)
            {
                value = (parts[0], parts[1]) switch
                {
                    ("cpu", "usage") => tick.Metrics.Cpu.Usage,
                    ("mem", "used_pct") => Pct(tick.Metrics.Mem.UsedB, tick.Metrics.Mem.TotalB),
                    ("mem", "swap_used_pct") => Pct(tick.Metrics.Mem.SwapUsedB, tick.Metrics.Mem.SwapTotalB),
                    ("net", "rx_bps") => tick.Metrics.Net.RxBps,
                    ("net", "tx_bps") => tick.Metrics.Net.TxBps,
                    ("sensors", "cpu_temp") => tick.Metrics.Sensors?.CpuTemp ?? double.NaN,
                    ("sensors", "gpu_temp") => tick.Metrics.Sensors?.GpuTemp ?? double.NaN,
                    _ => double.NaN,
                };
            }
            else if (parts.Length == 3 && parts[0] == "disk" && parts[2] == "used_pct")
            {
                var d = tick.Metrics.Disks.FirstOrDefault(x =>
                    string.Equals(x.Mount, parts[1], StringComparison.OrdinalIgnoreCase));
                value = d is null ? double.NaN : Pct(d.TotalB - d.AvailableB, d.TotalB);
            }
            return !double.IsNaN(value);
        }
        catch
        {
            return false;
        }
    }

    private static double Pct(double used, double total) => total > 0 ? used * 100.0 / total : double.NaN;

    private void Load()
    {
        try
        {
            if (!File.Exists(StorePath)) return;
            _history = JsonSerializer.Deserialize<List<AlertEntryDto>>(File.ReadAllText(StorePath), ConfigJson.Web) ?? new();
        }
        catch (Exception ex)
        {
            Program.Log($"alerts load failed: {ex.Message}");
        }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(StorePath, JsonSerializer.Serialize(_history, ConfigJson.Web));
        }
        catch (Exception ex)
        {
            Program.Log($"alerts save failed: {ex.Message}");
        }
    }
}
