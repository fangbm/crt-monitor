using System.IO.Pipes;
using System.Text;
using CrtMonitor.Collectors;

namespace CrtMonitor;

/// <summary>
/// 无界面采集子进程。只负责计时、读取系统指标与序列化；桌面进程只负责显示。
/// 主题/设置变更时由父进程重启本进程，确保采集图和配置完全一致。
/// </summary>
public static class CollectorMode
{
    private sealed class CollectorSession : IDisposable
    {
        private readonly Scheduler? _scheduler;
        private readonly ScopeSampler? _scope;
        private readonly LhmCollector? _lhm;
        private readonly SpectrumCollector? _spectrum;

        public int IntervalMs { get; }

        public CollectorSession(Config cfg)
        {
            bool scope = string.Equals(cfg.Theme, "scope", StringComparison.OrdinalIgnoreCase);
            IntervalMs = scope ? 50 : Math.Max(250, cfg.RefreshMs);
            if (scope)
            {
                _scope = new ScopeSampler(cfg.ScopeMetric);
                return;
            }

            var collectors = new List<ICollector>
            {
                new CpuMemCollector(),
                new DiskCollector(),
                new NetCollector(),
                new ProcessCollector(),
                new WeatherCollector(cfg.Weather),
                new MediaCollector(),
                new ScriptCollector(cfg.Scripts),
                new RemoteCollector(cfg.Remotes),
                new PingCollector(cfg.Pings),
                new EventsCollector(),
            };
            if (cfg.Lhm) collectors.Add(_lhm = new LhmCollector(enabled: true));
            if (cfg.Spectrum) collectors.Add(_spectrum = new SpectrumCollector(enabled: true));
            var (pluginCollectors, _) = PluginLoader.Load(Path.Combine(AppContext.BaseDirectory, "plugins"));
            collectors.AddRange(pluginCollectors);
            // 展示进程从管道 tick 聚合并持久化历史；这里不能再写同一份 history.json。
            _scheduler = new Scheduler(collectors, cfg, message => Program.Log($"collector alert: {message}"), recordHistory: false);
        }

        public string? CollectJson() => _scope?.CollectJson() ?? _scheduler?.CollectJson();

        public void Dispose()
        {
            _scope?.Dispose();
            _scheduler?.Dispose();
            _lhm?.Dispose();
            _spectrum?.Dispose();
        }
    }

    public static void Run(string pipeName) => RunAsync(pipeName).GetAwaiter().GetResult();

    private static async Task RunAsync(string pipeName)
    {
        try
        {
            using var pipe = new NamedPipeServerStream(
                pipeName, PipeDirection.Out, 1, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous | PipeOptions.CurrentUserOnly);
            pipe.WaitForConnection();
            using var writer = new StreamWriter(pipe, new UTF8Encoding(false), 1024, leaveOpen: true) { AutoFlush = true };
            using var session = new CollectorSession(ConfigStore.Load());
            using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(session.IntervalMs));

            // 首拍立即发出，随后保持同一后台时间基准，绝不依赖 UI 消息循环。
            do
            {
                string? json = session.CollectJson();
                if (json is not null) await writer.WriteLineAsync(json);
            }
            while (await timer.WaitForNextTickAsync());
        }
        catch (IOException)
        {
            // 父进程关闭管道属于正常退出。
        }
        catch (Exception ex)
        {
            Program.Log($"collector failed: {ex.Message}");
        }
    }
}
