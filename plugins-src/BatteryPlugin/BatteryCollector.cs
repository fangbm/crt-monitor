using CrtMonitor;
using CrtMonitor.Collectors;

namespace CrtMonitor.Plugin.Battery;

/// <summary>示例插件：电池状态（WinForms PowerStatus，免管理员）。宿主通过 PluginLoader 反射加载。</summary>
public sealed class BatteryCollector : ICollector
{
    public void Poll(TickDto tick)
    {
        var power = SystemInformation.PowerStatus;
        bool present = power.BatteryChargeStatus != BatteryChargeStatus.NoSystemBattery;
        tick.Metrics.Battery = new BatteryDto
        {
            Present = present,
            ChargePct = present ? Math.Round(power.BatteryLifePercent * 100, 0) : null,
            AcPower = power.PowerLineStatus == PowerLineStatus.Online,
        };
    }
}
