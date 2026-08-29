using System.Net;
using System.Text;

namespace CrtMonitor;

/// <summary>--serve 模式：无界面，在 http://127.0.0.1:9123/metrics 暴露本机指标 JSON，
/// 供另一台机器的 CRT-Monitor（remote 拉取）监控。LAN 访问需防火墙放行。</summary>
public static class ServeMode
{
    private const string Prefix = "http://127.0.0.1:9123/metrics/";

    private sealed class ServeState
    {
        public string? Latest;
        public readonly object Gate = new();
    }

    public static void Run(Config cfg)
    {
        Program.Log($"serve mode on {Prefix}");
        var scheduler = new Scheduler(cfg);
        var state = new ServeState();

        try
        {
            RunInner(cfg, scheduler, state);
        }
        catch (Exception ex)
        {
            Program.Log($"serve mode failed: {ex.Message}");
        }
        finally
        {
            scheduler.Dispose();
            Program.Log("serve mode exit");
        }
    }

    private static void RunInner(Config cfg, Scheduler scheduler, ServeState state)
    {
        using var timer = new System.Threading.Timer(
            _ =>
            {
                try
                {
                    var json = scheduler.CollectJson();
                    if (json is not null)
                        lock (state.Gate) state.Latest = json;
                }
                catch (Exception ex)
                {
                    Program.Log($"serve tick failed: {ex.Message}");
                }
            },
            null, 0, Math.Max(250, cfg.RefreshMs));

        var listener = new HttpListener();
        listener.Prefixes.Add(Prefix);
        listener.Start();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; listener.Stop(); };

        while (listener.IsListening)
        {
            try
            {
                var ctx = listener.GetContext();
                byte[] body;
                lock (state.Gate) body = Encoding.UTF8.GetBytes(state.Latest ?? "{}");
                ctx.Response.ContentType = "application/json";
                ctx.Response.ContentLength64 = body.Length;
                ctx.Response.OutputStream.Write(body);
                ctx.Response.Close();
            }
            catch (Exception ex) when (ex is HttpListenerException or ObjectDisposedException)
            {
                break;
            }
        }
    }
}
