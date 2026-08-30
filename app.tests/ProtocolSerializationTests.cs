using System.Text.Json;
using CrtMonitor;
using Xunit;

public class ProtocolSerializationTests
{
    private static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);

    /// <summary>协议对齐回归网：C# DTO 序列化字段名必须与前端 src/lib/types.ts 一致。</summary>
    [Fact]
    public void TickDto_FieldNames_MatchProtocol()
    {
        var tick = new TickDto
        {
            Ts = 123,
            UptimeSec = 456,
            Host = new HostDto { Name = "pc", Os = "win", CpuModel = "cpu", CoreCount = 4 },
            Metrics = new MetricsDto
            {
                Cpu = new CpuDto { Usage = 1, Cores = new List<double> { 1, 2 }, FreqMhz = 3000, CoresTemp = new List<double> { 40 } },
                Mem = new MemDto { TotalB = 1, UsedB = 2, SwapTotalB = 3, SwapUsedB = 4 },
                Disks = new List<DiskDto> { new DiskDto { Mount = "C", TotalB = 1, AvailableB = 1, ReadBps = 2, WriteBps = 3 } },
                Net = new NetDto { RxBps = 1, TxBps = 2, Nics = new List<NicDto> { new NicDto { Name = "eth", RxBps = 1, TxBps = 2 } } },
                Proc = new List<ProcDto> { new ProcDto { Name = "p", Cpu = 1, MemB = 2 } },
                Sensors = new SensorsDto { CpuTemp = 1, GpuTemp = 2, GpuLoad = 3, GpuName = "g", GpuMemUsedMb = 4, GpuMemTotalMb = 5 },
                Weather = new WeatherDto { TempC = 1, Humidity = 2, WindKmh = 3, Code = 0, Text = "晴", Place = "p", Aqi = 4, Pm25 = 5, Forecast = new List<ForecastDayDto> { new ForecastDayDto { Code = 1, MinC = 1, MaxC = 2 } } },
                Scripts = new List<ScriptDto> { new ScriptDto { Name = "s", Value = "v", AgeMs = 1 } },
                Remotes = new List<RemoteDto> { new RemoteDto { Name = "r", Cpu = 1, MemPct = 2, MemUsed = 3, MemTotal = 4, RxBps = 5, TxBps = 6, AgeMs = 7 } },
                Pings = new List<PingDto> { new PingDto { Name = "g", Ms = 1, LostPct = 2, Series = new List<double> { 1 } } },
                Events = new List<EventDto> { new EventDto { Ts = 1, Level = "err", Source = "s", Msg = "m" } },
                Boot = new BootDto { BootedAt = 1, LastShutdown = 2 },
                Battery = new BatteryDto { Present = true, ChargePct = 50, AcPower = true },
                Spectrum = new List<double> { 0.5 },
                Alerts = new List<string> { "a" },
                AlertHistory = new List<AlertEntryDto> { new AlertEntryDto { Ts = 1, Msg = "m" } },
                Smart = new List<SmartDto> { new SmartDto { Name = "d", Temp = 40, LifePct = 50, UsedPct = 10 } },
                Media = new MediaDto { Title = "t", Artist = "a", Status = "playing", PosSec = 1, DurSec = 2, Volume = 30, Muted = false },
            },
        };

        string json = JsonSerializer.Serialize(tick, Web);
        string[] expected =
        {
            "\"version\"", "\"ts\"", "\"uptime\"", "\"host\"", "\"metrics\"",
            "\"cores\"", "\"freq_mhz\"", "\"cores_temp\"",
            "\"total_b\"", "\"used_b\"", "\"swap_total_b\"", "\"swap_used_b\"",
            "\"read_bps\"", "\"write_bps\"", "\"mount\"",
            "\"rx_bps\"", "\"tx_bps\"", "\"nics\"",
            "\"proc\"", "\"mem_b\"",
            "\"sensors\"", "\"cpu_temp\"", "\"gpu_temp\"", "\"gpu_load\"", "\"gpu_name\"",
            "\"gpu_mem_used_mb\"", "\"gpu_mem_total_mb\"",
            "\"weather\"", "\"humidity\"", "\"wind_kmh\"", "\"aqi\"", "\"pm25\"", "\"forecast\"",
            "\"battery\"", "\"charge_pct\"", "\"ac_power\"",
            "\"spectrum\"", "\"alerts\"", "\"alert_history\"",
            "\"smart\"", "\"life_pct\"", "\"used_pct\"",
            "\"media\"", "\"pos_sec\"", "\"dur_sec\"", "\"volume\"", "\"muted\"",
            "\"scripts\"", "\"remotes\"", "\"mem_pct\"", "\"age_ms\"",
            "\"pings\"", "\"lost_pct\"", "\"series\"",
            "\"events\"", "\"level\"", "\"source\"", "\"msg\"",
            "\"boot\"", "\"booted_at\"", "\"last_shutdown\"",
            "\"pings\"", "\"nics\"",
        };
        foreach (var name in expected)
            Assert.Contains(name, json);
    }

    /// <summary>前端形状（types.ts 的 JSON）必须能反序列化回 C# DTO（Web 远看/测试用）。</summary>
    [Fact]
    public void FrontendShape_Deserializes()
    {
        const string json = """
        {
          "version": 1, "ts": 1, "uptime": 2,
          "host": { "name": "n", "os": "o", "cpu_model": "c", "core_count": 2 },
          "metrics": {
            "cpu": { "usage": 1, "cores": [1,2], "freq_mhz": 3000, "cores_temp": [40,41] },
            "mem": { "total_b": 1, "used_b": 2, "swap_total_b": 0, "swap_used_b": 0 },
            "disks": [{ "name": "d", "mount": "C", "total_b": 1, "available_b": 1, "read_bps": null, "write_bps": null }],
            "net": { "rx_bps": 1, "tx_bps": 2, "nics": [{ "name": "wlan", "rx_bps": 1, "tx_bps": 2 }] },
            "proc": [],
            "sensors": { "cpu_temp": null, "gpu_temp": null, "gpu_load": 5, "gpu_name": "", "gpu_mem_used_mb": null, "gpu_mem_total_mb": null },
            "weather": null,
            "scripts": [], "remotes": [], "pings": [], "events": [],
            "boot": { "booted_at": 1, "last_shutdown": 2 },
            "battery": null, "spectrum": [], "alerts": [], "alert_history": null,
            "smart": null, "media": null
          }
        }
        """;
        var tick = JsonSerializer.Deserialize<TickDto>(json, Web);
        Assert.NotNull(tick);
        Assert.Equal(1, tick!.Metrics.Cpu.Usage);
        Assert.Equal(2, tick.Metrics.Cpu.Cores.Count);
        Assert.Equal(2, tick.Metrics.Cpu.CoresTemp!.Count);
        Assert.Single(tick.Metrics.Net.Nics);
    }
}
