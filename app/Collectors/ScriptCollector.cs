using System.Diagnostics;

namespace CrtMonitor.Collectors;

/// <summary>脚本数据源：按配置定时运行外部命令（cmd /c），stdout 首行作为卡片值。
/// 把扩展门槛从"会 C#"降到"会写命令行"。执行在后台线程，超时 5s。</summary>
public sealed class ScriptCollector : ICollector
{
    private sealed class Slot
    {
        public DateTime Next = DateTime.MinValue;
        public long AtMs = -1;
        public string? Value;
        public bool InFlight;
    }

    private readonly List<ScriptConfig> _scripts;
    private readonly Dictionary<string, Slot> _state = new();

    public ScriptCollector(List<ScriptConfig>? scripts)
    {
        _scripts = scripts ?? new List<ScriptConfig>();
    }

    public void Poll(TickDto tick)
    {
        var results = new List<ScriptDto>();
        foreach (var sc in _scripts)
        {
            if (string.IsNullOrWhiteSpace(sc.Name) || string.IsNullOrWhiteSpace(sc.Cmd)) continue;
            var slot = _state.TryGetValue(sc.Name, out var s)
                ? s
                : _state[sc.Name] = new Slot();

            if (!slot.InFlight && DateTime.UtcNow >= slot.Next)
            {
                slot.InFlight = true;
                slot.Next = DateTime.UtcNow.AddSeconds(Math.Max(2, sc.IntervalSec));
                Task.Run(() => RunOne(sc, slot));
            }
            results.Add(new ScriptDto
            {
                Name = sc.Name,
                Value = slot.Value ?? "…",
                AgeMs = slot.AtMs < 0 ? -1 : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - slot.AtMs,
            });
        }
        tick.Metrics.Scripts = results;
    }

    private void RunOne(ScriptConfig sc, Slot slot)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo("cmd.exe", "/c " + sc.Cmd)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            });
            // ReadLine 是同步阻塞的：命令不输出就直接卡死，必须带超时读
            var readTask = p!.StandardOutput.ReadLineAsync();
            if (!readTask.Wait(5000))
            {
                p.Kill(entireProcessTree: true);
                return;
            }
            string? line = readTask.Status == TaskStatus.RanToCompletion ? readTask.Result : null;
            if (!p.WaitForExit(2000))
            {
                p.Kill(entireProcessTree: true);
                return; // 超时不更新值
            }
            slot.Value = (line ?? "").Trim();
            slot.AtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        }
        catch (Exception ex)
        {
            Program.Log($"script '{sc.Name}' failed: {ex.Message}");
        }
        finally
        {
            slot.InFlight = false;
        }
    }
}
