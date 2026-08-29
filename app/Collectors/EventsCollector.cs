using System.Diagnostics;

namespace CrtMonitor.Collectors;

/// <summary>系统事件卡：System/Application 日志里最近 24h 的错误/警告（新→旧，最多 10 条）。
/// 经典 EventLog 反向扫描，60s 缓存；无权限的日志自动跳过。</summary>
public sealed class EventsCollector : ICollector
{
    private List<EventDto>? _cache;
    private DateTime _nextScanUtc = DateTime.MinValue;
    private bool _busy;

    public void Poll(TickDto tick)
    {
        if (_cache is not null) tick.Metrics.Events = _cache;
        if (DateTime.UtcNow < _nextScanUtc || _busy) return;
        _busy = true;
        _nextScanUtc = DateTime.UtcNow.AddSeconds(60);
        Task.Run(() =>
        {
            try
            {
                var all = new List<EventDto>();
                foreach (var logName in new[] { "System", "Application" })
                {
                    try
                    {
                        using var log = new EventLog(logName);
                        int count = log.Entries.Count;
                        var cutoff = DateTime.Now.AddHours(-24);
                        for (int i = count - 1; i >= 0 && count - i < 800; i--)
                        {
                            var e = log.Entries[i];
                            if (e.TimeWritten < cutoff) break;
                            if (e.EntryType is not (EventLogEntryType.Error or EventLogEntryType.Warning)) continue;
                            string msg = e.Message ?? "";
                            int nl = msg.IndexOfAny(new[] { '\r', '\n' });
                            if (nl > 0) msg = msg[..nl];
                            all.Add(new EventDto
                            {
                                Ts = new DateTimeOffset(e.TimeWritten.ToUniversalTime()).ToUnixTimeMilliseconds(),
                                Level = e.EntryType == EventLogEntryType.Error ? "err" : "warn",
                                Source = e.Source,
                                Msg = msg.Length > 70 ? msg[..69] + "…" : msg,
                            });
                            if (all.Count >= 10) break;
                        }
                    }
                    catch { /* 无权限/日志不存在：跳过该日志 */ }
                    if (all.Count >= 10) break;
                }
                _cache = all.OrderBy(e => e.Ts).Reverse().ToList();
            }
            catch (Exception ex)
            {
                Program.Log($"events scan failed: {ex.Message}");
            }
            finally
            {
                _busy = false;
            }
        });
    }
}
