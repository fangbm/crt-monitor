using System.Text.Json.Serialization;

namespace CrtMonitor;

/// <summary>metrics tick 载荷协议 v1，字段名与前端 src/lib/types.ts 一一对应。</summary>
public sealed class TickDto
{
    [JsonPropertyName("version")] public int Version { get; set; } = 1;
    [JsonPropertyName("ts")] public long Ts { get; set; }
    [JsonPropertyName("uptime")] public long UptimeSec { get; set; }
    [JsonPropertyName("host")] public HostDto Host { get; set; } = new();
    [JsonPropertyName("metrics")] public MetricsDto Metrics { get; set; } = new();
}

public sealed class HostDto
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("os")] public string Os { get; set; } = "";
    [JsonPropertyName("cpu_model")] public string CpuModel { get; set; } = "";
    [JsonPropertyName("core_count")] public int CoreCount { get; set; }
}

public sealed class MetricsDto
{
    [JsonPropertyName("cpu")] public CpuDto Cpu { get; set; } = new();
    [JsonPropertyName("mem")] public MemDto Mem { get; set; } = new();
    [JsonPropertyName("disks")] public List<DiskDto> Disks { get; set; } = new();
    [JsonPropertyName("net")] public NetDto Net { get; set; } = new();
    [JsonPropertyName("proc")] public List<ProcDto> Proc { get; set; } = new();
    [JsonPropertyName("sensors")] public SensorsDto? Sensors { get; set; }
    [JsonPropertyName("weather")] public WeatherDto? Weather { get; set; }
    [JsonPropertyName("battery")] public BatteryDto? Battery { get; set; }
    [JsonPropertyName("alerts")] public List<string> Alerts { get; set; } = new();
    /// <summary>最近的告警记录（新→旧，最多 30 条）</summary>
    [JsonPropertyName("alert_history")] public List<AlertEntryDto> AlertHistory { get; set; } = new();
}

public sealed class AlertEntryDto
{
    [JsonPropertyName("ts")] public long Ts { get; set; }
    [JsonPropertyName("msg")] public string Msg { get; set; } = "";
}

public sealed class BatteryDto
{
    [JsonPropertyName("present")] public bool Present { get; set; }
    /** 0-100，无电池为 null */
    [JsonPropertyName("charge_pct")] public double? ChargePct { get; set; }
    [JsonPropertyName("ac_power")] public bool AcPower { get; set; }
}

/** 独立的 history 消息载荷（低频推送，不进 tick） */
public sealed class HistoryDto
{
    [JsonPropertyName("type")] public string Type { get; set; } = "history";
    /** 分钟起点 unix 秒 */
    [JsonPropertyName("points")] public List<HistoryPointDto> Points { get; set; } = new();
    [JsonPropertyName("stats")] public HistoryStatsDto Stats { get; set; } = new();
}

public sealed class HistoryPointDto
{
    [JsonPropertyName("t")] public long T { get; set; }
    [JsonPropertyName("cpu")] public double Cpu { get; set; }
    [JsonPropertyName("cpu_max")] public double CpuMax { get; set; }
    /** 0-100 */
    [JsonPropertyName("mem")] public double Mem { get; set; }
    [JsonPropertyName("rx")] public double Rx { get; set; }
    [JsonPropertyName("tx")] public double Tx { get; set; }
}

public sealed class HistoryStatsDto
{
    [JsonPropertyName("cpu_max")] public double CpuMax { get; set; }
    [JsonPropertyName("cpu_avg")] public double CpuAvg { get; set; }
    [JsonPropertyName("mem_max")] public double MemMax { get; set; }
    [JsonPropertyName("rx_max")] public double RxMax { get; set; }
    [JsonPropertyName("tx_max")] public double TxMax { get; set; }
    /// <summary>今日累计下载字节（近似积分）</summary>
    [JsonPropertyName("today_rx")] public double TodayRx { get; set; }
    /// <summary>今日累计上传字节</summary>
    [JsonPropertyName("today_tx")] public double TodayTx { get; set; }
}

public sealed class SensorsDto
{
    [JsonPropertyName("cpu_temp")] public double? CpuTemp { get; set; }
    [JsonPropertyName("gpu_temp")] public double? GpuTemp { get; set; }
    /** GPU 核心负载 0-100 */
    [JsonPropertyName("gpu_load")] public double? GpuLoad { get; set; }
    [JsonPropertyName("gpu_name")] public string GpuName { get; set; } = "";
}

public sealed class WeatherDto
{
    [JsonPropertyName("temp_c")] public double TempC { get; set; }
    [JsonPropertyName("humidity")] public int Humidity { get; set; }
    [JsonPropertyName("wind_kmh")] public double WindKmh { get; set; }
    /** Open-Meteo WMO code */
    [JsonPropertyName("code")] public int Code { get; set; }
    [JsonPropertyName("text")] public string Text { get; set; } = "";
    [JsonPropertyName("place")] public string Place { get; set; } = "";
    /// <summary>未来 3 天预报（不含今天）</summary>
    [JsonPropertyName("forecast")] public List<ForecastDayDto> Forecast { get; set; } = new();
}

public sealed class ForecastDayDto
{
    [JsonPropertyName("code")] public int Code { get; set; }
    [JsonPropertyName("min_c")] public double MinC { get; set; }
    [JsonPropertyName("max_c")] public double MaxC { get; set; }
}

public sealed class ProcDto
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    /** 同名进程合并后为 "chrome x3" */
    [JsonPropertyName("cpu")] public double Cpu { get; set; }
    [JsonPropertyName("mem_b")] public long MemB { get; set; }
}

public sealed class CpuDto
{
    [JsonPropertyName("usage")] public double Usage { get; set; }
    [JsonPropertyName("cores")] public List<double> Cores { get; set; } = new();
    [JsonPropertyName("freq_mhz")] public long? FreqMhz { get; set; }
}

public sealed class MemDto
{
    [JsonPropertyName("total_b")] public ulong TotalB { get; set; }
    [JsonPropertyName("used_b")] public ulong UsedB { get; set; }
    [JsonPropertyName("swap_total_b")] public ulong SwapTotalB { get; set; }
    [JsonPropertyName("swap_used_b")] public ulong SwapUsedB { get; set; }
}

public sealed class DiskDto
{
    [JsonPropertyName("name")] public string Name { get; set; } = "";
    [JsonPropertyName("mount")] public string Mount { get; set; } = "";
    [JsonPropertyName("total_b")] public ulong TotalB { get; set; }
    [JsonPropertyName("available_b")] public ulong AvailableB { get; set; }
    [JsonPropertyName("read_bps")] public double? ReadBps { get; set; }
    [JsonPropertyName("write_bps")] public double? WriteBps { get; set; }
}

public sealed class NetDto
{
    [JsonPropertyName("rx_bps")] public double RxBps { get; set; }
    [JsonPropertyName("tx_bps")] public double TxBps { get; set; }
}
