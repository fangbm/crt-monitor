using LibreHardwareMonitor.Hardware;

namespace CrtMonitor.Collectors;

/// <summary>CPU/GPU 温度与 GPU 负载：LibreHardwareMonitor。
/// 需要管理员权限加载 WinRing0 驱动；未提权时传感器列表为空，本采集器安静返回 null。</summary>
public sealed class LhmCollector : ICollector, IDisposable
{
    private Computer? _computer;
    private readonly bool _scopeOnly;

    public LhmCollector(bool enabled, bool scopeOnly = false)
    {
        if (!enabled) return;
        _scopeOnly = scopeOnly;
        // Open() 可能耗时 1-3s（枚举 SMBus/存储），放后台线程避免卡首个 tick
        Program.Log("LHM init v2");
        Start();
    }

    private void Start()
    {
        Task.Run(() =>
        {
            try
            {
                var computer = new Computer
                {
                    IsCpuEnabled = true,
                    IsGpuEnabled = true,
                    IsStorageEnabled = !_scopeOnly,
                };
                computer.Open();
                _computer = computer;
                // 一次性枚举：诊断存储/GPU 是否被 LHM 识别
                foreach (var hw in computer.Hardware)
                    Program.Log($"LHM hw: {hw.HardwareType} '{hw.Name}' sensors={hw.Sensors.Length} subs={hw.SubHardware.Length}");
                Program.Log("LHM opened");
            }
            catch (Exception ex)
            {
                Program.Log($"LHM open failed: {ex.Message}");
            }
        });
    }

    public void Poll(TickDto tick)
    {
        var dto = new SensorsDto();
        var smart = new List<SmartDto>();
        var computer = _computer;
        if (computer is not null)
        {
            try
            {
                foreach (var hw in computer.Hardware)
                {
                    hw.Update();
                    foreach (var sub in hw.SubHardware) sub.Update();

                    bool isCpu = hw.HardwareType == HardwareType.Cpu;
                    bool isGpu = hw.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel;
                    bool isStorage = hw.HardwareType == HardwareType.Storage;
                    if (isGpu && dto.GpuName.Length == 0) dto.GpuName = hw.Name;

                    // 全部传感器（含子硬件，NVMe 在 Storage 的子层）
                    var sensors = hw.Sensors.Concat(hw.SubHardware.SelectMany(s => s.Sensors)).ToList();

                    if (isStorage)
                    {
                        var s = new SmartDto { Name = hw.Name.Length > 24 ? hw.Name[..23] + "…" : hw.Name };
                        foreach (var sensor in sensors)
                        {
                            if (sensor.Value is not { } value) continue;
                            if (sensor.SensorType == SensorType.Temperature && sensor.Name.Contains("Temperature"))
                                s.Temp ??= Math.Round(value, 0);
                            if (sensor.SensorType == SensorType.Level && sensor.Name.Contains("Remaining Life"))
                                s.LifePct ??= Math.Round(value, 0);
                            if (sensor.SensorType == SensorType.Load && sensor.Name.Contains("Used Space"))
                                s.UsedPct ??= Math.Round(value, 0);
                        }
                        smart.Add(s);
                        continue;
                    }

                    if (isCpu)
                    {
                        // CPU 包温度：Intel 叫 Package；AMD 只有一个 "Core (Tctl/Tdie)"。
                        // 都没匹配到时兜底取 CPU 上任意温度传感器。0°C 是无效读数（部分
                        // AMD 移动版经 WinRing0 读出恒 0），按无数据处理。
                        var temps = sensors.Where(x => x.SensorType == SensorType.Temperature && x.Value is > 0).ToList();
                        var pkg = temps.FirstOrDefault(x => x.Name.Contains("Package"))
                               ?? temps.FirstOrDefault(x => x.Name.Contains("Tctl"))
                               ?? temps.FirstOrDefault();
                        if (pkg?.Value is { } cpuT)
                            dto.CpuTemp = Math.Round(cpuT, 0);

                        // 每核温度：Intel 有逐核；AMD 只有单一 Tctl → 复制到全部核（热力图温度模式可用）
                        var coreTemps = temps
                            .Where(x => x.Name.StartsWith("Core #"))
                            .OrderBy(x => x.Name, StringComparer.CurrentCulture)
                            .Select(x => Math.Round(x.Value ?? 0, 0))
                            .ToList();
                        if (coreTemps.Count == 0 && pkg?.Value is { } t)
                            coreTemps = Enumerable.Repeat(Math.Round(t, 0), tick.Host.CoreCount).ToList();
                        if (coreTemps.Count > 0)
                            tick.Metrics.Cpu.CoresTemp = coreTemps;
                    }

                    foreach (var sensor in sensors)
                    {
                        if (sensor.Value is not { } value) continue;
                        if (isGpu && sensor.SensorType == SensorType.Temperature)
                            dto.GpuTemp ??= Math.Round(value, 0);
                        if (isGpu && sensor.SensorType == SensorType.Load
                                 && (sensor.Name.Contains("Core") || sensor.Name.Equals("GPU Load", StringComparison.OrdinalIgnoreCase)))
                            dto.GpuLoad ??= Math.Round(value, 0);
                        if (isGpu && (sensor.SensorType == SensorType.SmallData || sensor.SensorType == SensorType.Data))
                        {
                            if (sensor.Name.Contains("Used")) dto.GpuMemUsedMb ??= Math.Round(value, 0);
                            if (sensor.Name.Contains("Total")) dto.GpuMemTotalMb ??= Math.Round(value, 0);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Program.Log($"LHM poll failed: {ex.Message}");
            }
        }
        tick.Metrics.Sensors = dto;
        tick.Metrics.Smart = smart;
    }

    /// <summary>示波器专用：仅轮询所选 CPU 或 GPU 温度，不扫描 SMART、负载或其余硬件。</summary>
    public void PollScopeTemperature(TickDto tick, bool cpu)
    {
        var dto = new SensorsDto();
        var computer = _computer;
        if (computer is null)
        {
            tick.Metrics.Sensors = dto;
            return;
        }
        try
        {
            foreach (var hw in computer.Hardware)
            {
                bool matched = cpu ? hw.HardwareType == HardwareType.Cpu
                    : hw.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel;
                if (!matched) continue;
                hw.Update();
                foreach (var sub in hw.SubHardware) sub.Update();
                var temps = hw.Sensors.Concat(hw.SubHardware.SelectMany(s => s.Sensors))
                    .Where(s => s.SensorType == SensorType.Temperature && s.Value is > 0)
                    .ToList();
                if (cpu)
                {
                    var preferred = temps.FirstOrDefault(s => s.Name.Contains("Package"))
                        ?? temps.FirstOrDefault(s => s.Name.Contains("Tctl"))
                        ?? temps.FirstOrDefault();
                    if (preferred?.Value is { } value) dto.CpuTemp = Math.Round(value, 1);
                }
                else
                {
                    dto.GpuName = hw.Name;
                    if (temps.FirstOrDefault()?.Value is { } value) dto.GpuTemp = Math.Round(value, 1);
                }
                break;
            }
        }
        catch (Exception ex)
        {
            Program.Log($"LHM scope poll failed: {ex.Message}");
        }
        tick.Metrics.Sensors = dto;
    }

    public void Dispose()
    {
        try { _computer?.Close(); } catch { /* 退出时忽略 */ }
    }
}
