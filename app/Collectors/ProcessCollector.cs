using System.Diagnostics;

namespace CrtMonitor.Collectors;

/// <summary>进程 Top 榜：CPU 差分 + 工作集，同名进程合并。免管理员（系统进程访问受限时自动跳过）。</summary>
public sealed class ProcessCollector : ICollector
{
    private const int TopN = 8;

    private Dictionary<int, TimeSpan> _prevCpu = new();
    private long _prevAt;
    private bool _hasPrev;

    public void Poll(TickDto tick)
    {
        long now = Stopwatch.GetTimestamp();
        double dt = _hasPrev ? (now - _prevAt) / (double)Stopwatch.Frequency : 0;

        var current = new Dictionary<int, TimeSpan>();
        var agg = new Dictionary<string, (double cpu, long mem, int count)>(StringComparer.OrdinalIgnoreCase);

        foreach (var p in Process.GetProcesses())
        {
            try
            {
                TimeSpan total = p.TotalProcessorTime;
                current[p.Id] = total;

                double cpu = 0;
                if (dt > 0.2 && _prevCpu.TryGetValue(p.Id, out var prev))
                {
                    double coreMs = (total - prev).TotalMilliseconds;
                    cpu = Math.Max(0, coreMs / (dt * 1000.0) / Environment.ProcessorCount * 100.0);
                }
                long mem = p.WorkingSet64;

                string name = p.ProcessName;
                var slot = agg.TryGetValue(name, out var s) ? s : (0, 0, 0);
                agg[name] = (slot.cpu + cpu, slot.mem + mem, slot.count + 1);
            }
            catch
            {
                // 系统进程的 TotalProcessorTime/WorkingSet 可能拒绝访问（80070005 / 87）
            }
            finally
            {
                p.Dispose();
            }
        }

        _prevCpu = current;
        _prevAt = now;
        _hasPrev = true;

        tick.Metrics.Proc = agg
            .Select(kv => new ProcDto
            {
                Name = kv.Value.count > 1 ? $"{kv.Key} x{kv.Value.count}" : kv.Key,
                Cpu = Math.Round(kv.Value.cpu, 1),
                MemB = kv.Value.mem,
            })
            .OrderByDescending(p => p.Cpu)
            .ThenByDescending(p => p.MemB)
            .Take(TopN)
            .ToList();
    }
}
