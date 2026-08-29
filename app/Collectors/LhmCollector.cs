using LibreHardwareMonitor.Hardware;

namespace CrtMonitor.Collectors;

/// <summary>CPU/GPU 温度与 GPU 负载：LibreHardwareMonitor。
/// 需要管理员权限加载 WinRing0 驱动；未提权时传感器列表为空，本采集器安静返回 null。</summary>
public sealed class LhmCollector : ICollector, IDisposable
{
    private Computer? _computer;

    public LhmCollector(bool enabled)
    {
        if (!enabled) return;
        // Open() 可能耗时 1-3s（枚举 SMBus/显卡），放后台线程避免卡首个 tick
        Task.Run(() =>
        {
            try
            {
                var computer = new Computer { IsCpuEnabled = true, IsGpuEnabled = true };
                computer.Open();
                _computer = computer;
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
                    if (isGpu && dto.GpuName.Length == 0) dto.GpuName = hw.Name;

                    foreach (var sensor in hw.Sensors.Concat(hw.SubHardware.SelectMany(s => s.Sensors)))
                    {
                        if (sensor.Value is not { } value) continue;
                        if (isCpu && sensor.SensorType == SensorType.Temperature
                                 && (sensor.Name.Contains("Package") || sensor.Name.Contains("Tctl")))
                            dto.CpuTemp ??= Math.Round(value, 0);
                        if (isGpu && sensor.SensorType == SensorType.Temperature && sensor.Name.Contains("Core"))
                            dto.GpuTemp ??= Math.Round(value, 0);
                        if (isGpu && sensor.SensorType == SensorType.Load && sensor.Name.Contains("Core"))
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
    }

    public void Dispose()
    {
        try { _computer?.Close(); } catch { /* 退出时忽略 */ }
    }
}
