using CrtMonitor;
using CrtMonitor.Collectors;
using Xunit;

public class AlertEvaluatorTests
{
    private static TickDto Tick(double cpuUsage = 10, double memPct = 40) => new()
    {
        Ts = 1000,
        Metrics = new MetricsDto
        {
            Cpu = new CpuDto { Usage = cpuUsage, Cores = new List<double> { cpuUsage } },
            Mem = new MemDto { TotalB = 100, UsedB = (ulong)memPct },
            Disks = new List<DiskDto>
            {
                new DiskDto { Mount = "C", TotalB = 100, AvailableB = 25 },
            },
        },
    };

    private static AlertRule Rule(string metric = "cpu.usage", string op = ">", double value = 50) => new()
    {
        Metric = metric, Op = op, Value = value, Seconds = 0, Cooldown = 0,
    };

    private static List<string> AlertsOf(AlertEvaluator eval, TickDto tick)
    {
        eval.Evaluate(tick);
        return tick.Metrics.Alerts;
    }

    [Fact]
    public void Fires_WhenThresholdExceeded()
    {
        var eval = new AlertEvaluator(new List<AlertRule> { Rule() }, sound: false, notify: null);
        var alerts = AlertsOf(eval, Tick(cpuUsage: 80));
        var alert = Assert.Single(alerts);
        Assert.Contains("80%", alert);
    }

    [Fact]
    public void Silent_BelowThreshold()
    {
        var eval = new AlertEvaluator(new List<AlertRule> { Rule() }, sound: false, notify: null);
        Assert.Empty(AlertsOf(eval, Tick(cpuUsage: 30)));
    }

    [Fact]
    public void LessThan_Operator_Works()
    {
        var eval = new AlertEvaluator(new List<AlertRule> { Rule(metric: "cpu.usage", op: "<", value: 5) }, false, null);
        Assert.Single(AlertsOf(eval, Tick(cpuUsage: 2)));
    }

    [Fact]
    public void MemUsedPct_Path()
    {
        var eval = new AlertEvaluator(new List<AlertRule> { Rule(metric: "mem.used_pct", value: 90) }, false, null);
        Assert.Empty(AlertsOf(eval, Tick(memPct: 40))); // 40% 未超 90%
        var eval2 = new AlertEvaluator(new List<AlertRule> { Rule(metric: "mem.used_pct", value: 30) }, false, null);
        Assert.Single(AlertsOf(eval2, Tick(memPct: 40))); // 40% > 30% 触发
    }

    [Fact]
    public void DiskPath_UsedPct()
    {
        var eval = new AlertEvaluator(new List<AlertRule> { Rule(metric: "disk.C.used_pct", value: 70) }, false, null);
        Assert.Single(AlertsOf(eval, Tick())); // C: 75/100 → 75%
    }

    [Fact]
    public void MissingSensor_Skips()
    {
        var eval = new AlertEvaluator(new List<AlertRule> { Rule(metric: "sensors.cpu_temp", value: 10) }, false, null);
        Assert.Empty(AlertsOf(eval, Tick())); // sensors 为 null → NaN → 跳过
    }

    [Fact]
    public void NoRules_NoAlerts()
    {
        var eval = new AlertEvaluator(null, false, null);
        Assert.Empty(AlertsOf(eval, Tick(cpuUsage: 99)));
    }
}
