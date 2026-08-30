using System.Text.Json;
using CrtMonitor.Collectors;

namespace CrtMonitor;

/// <summary>示波器专用 20Hz 采样器：每拍只读取 CH1 对应的单一指标。</summary>
public sealed class ScopeSampler : IDisposable
{
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);
    private readonly string _metric;
    private readonly CpuMemCollector? _cpuMem;
    private readonly NetCollector? _net;
    private readonly LhmCollector? _lhm;

    public ScopeSampler(string? metric)
    {
        _metric = metric ?? "cpu.usage";
        switch (_metric)
        {
            case "cpu.usage":
            case "mem.used_pct":
                _cpuMem = new CpuMemCollector();
                break;
            case "net.rx_bps":
            case "net.tx_bps":
                _net = new NetCollector();
                break;
            case "sensors.cpu_temp":
            case "sensors.gpu_temp":
                _lhm = new LhmCollector(enabled: true, scopeOnly: true);
                break;
            default:
                _metric = "cpu.usage";
                _cpuMem = new CpuMemCollector();
                break;
        }
    }

    public string? CollectJson()
    {
        try
        {
            var tick = new TickDto
            {
                Ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                // scope 页头被隐藏；保留静态非空值避免前端每拍重复初始化头部。
                Host = new HostDto { Name = "SCOPE", Os = "20Hz", CpuModel = _metric },
            };
            switch (_metric)
            {
                case "cpu.usage": _cpuMem!.PollCpuOnly(tick); break;
                case "mem.used_pct": _cpuMem!.PollMemOnly(tick); break;
                case "net.rx_bps":
                case "net.tx_bps": _net!.Poll(tick); break;
                case "sensors.cpu_temp": _lhm!.PollScopeTemperature(tick, cpu: true); break;
                case "sensors.gpu_temp": _lhm!.PollScopeTemperature(tick, cpu: false); break;
            }
            return JsonSerializer.Serialize(tick, JsonOpts);
        }
        catch (Exception ex)
        {
            Program.Log($"scope collect failed: {ex.Message}");
            return null;
        }
    }

    public void Dispose() => _lhm?.Dispose();
}
