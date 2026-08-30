using CrtMonitor;
using CrtMonitor.Collectors;
using Xunit;

public class HistoryServiceTests
{
    private static TickDto Tick(long tsMs, double cpu = 10, double rx = 1000, double temp = 0)
    {
        var t = new TickDto
        {
            Ts = tsMs,
            Metrics = new MetricsDto
            {
                Cpu = new CpuDto { Usage = cpu },
                Net = new NetDto { RxBps = rx, TxBps = 10 },
                Mem = new MemDto { TotalB = 1000, UsedB = 500 },
            },
        };
        if (temp > 0) t.Metrics.Sensors = new SensorsDto { CpuTemp = temp };
        return t;
    }

    [Fact]
    public void MinuteAggregation_OnePointPerMinute()
    {
        var svc = new HistoryService();
        long baseMs = 1_700_000_000_000;
        for (int s = 0; s < 10; s++)
            svc.Add(Tick(baseMs + s * 1000, cpu: 10 + s));
        var snap = svc.Snapshot();
        var point = Assert.Single(snap.Points);
        Assert.Equal(baseMs / 60000 * 60, point.T);
        // 滑动平均收敛于末值方向（非算术平均）
        Assert.InRange(point.Cpu, 17, 19);
    }

    [Fact]
    public void Temp_Ignored_WhenZero()
    {
        var svc = new HistoryService();
        svc.Add(Tick(1_700_000_000_000, temp: 0));
        Assert.Equal(0, svc.Snapshot().Points[0].Temp);
    }

    [Fact]
    public void Temp_Recorded_WhenPositive()
    {
        var svc = new HistoryService();
        svc.Add(Tick(1_700_000_000_000, temp: 55));
        var p = svc.Snapshot().Points[0];
        Assert.Equal(55, p.Temp);
        Assert.Equal(55, p.TempMax);
    }

    [Fact]
    public void TenMinute_Downsample_Created()
    {
        var svc = new HistoryService();
        long baseMs = 1_700_000_000_000;
        for (int s = 0; s < 5; s++)
            svc.Add(Tick(baseMs + s * 60_000)); // 每分钟一拍，跨 5 分钟
        var snap = svc.Snapshot();
        Assert.Equal(5, snap.Points.Count);
        // 5 分钟落在同一个 10 分钟桶
        var p10 = Assert.Single(snap.Points10m);
        Assert.Equal(baseMs / 600_000 * 600, p10.T);
    }

    [Fact]
    public void Csv_HasHeader_AndRows()
    {
        var svc = new HistoryService();
        svc.Add(Tick(1_700_000_000_000, cpu: 33));
        var csv = svc.ToCsv();
        Assert.StartsWith("time,cpu,cpu_max,mem_pct,rx_bps,tx_bps,temp,temp_max", csv);
        Assert.Equal(2, csv.Split('\n').Length - 1); // 表头 + 1 行
    }
}
