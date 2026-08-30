using System.Net;
using System.Net.Sockets;
using System.Text;
using CrtMonitor.Collectors;

namespace CrtMonitor;

/// <summary>--serve 模式：无界面，在 http://本机IP:9123/metrics 暴露本机指标 JSON，
/// 供另一台机器的 CRT-Monitor（remote 拉取）监控。LAN 访问需防火墙放行。</summary>
public static class ServeMode
{
    private const int Port = 9123;
    private const string Endpoint = "/metrics/";

    private static List<ICollector> BuildCollectors(Config cfg)
    {
        return new List<ICollector>
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
    }

    private sealed class ServeState
    {
        public string? Latest;
        public readonly object Gate = new();
    }

    public static void Run(Config cfg)
    {
        Program.Log($"serve mode on http://*:{Port}{Endpoint}");
        var scheduler = new Scheduler(BuildCollectors(cfg), cfg, null);
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

        using var listener = new TcpListener(IPAddress.Any, Port);
        listener.Start();
        Console.CancelKeyPress += (_, e) => { e.Cancel = true; listener.Stop(); };

        while (true)
        {
            try
            {
                var client = listener.AcceptTcpClient();
                _ = Task.Run(() => HandleClient(client, state));
            }
            catch (Exception ex) when (ex is SocketException or ObjectDisposedException)
            {
                break;
            }
        }
    }

    private static async Task HandleClient(TcpClient client, ServeState state)
    {
        using (client)
        await using (var stream = client.GetStream())
        using (var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, leaveOpen: true))
        {
            string? requestLine = await reader.ReadLineAsync();
            if (string.IsNullOrWhiteSpace(requestLine)) return;
            for (int i = 0; i < 100; i++)
            {
                if (string.IsNullOrEmpty(await reader.ReadLineAsync())) break;
            }

            string[] request = requestLine.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            bool metrics = request.Length >= 2
                && string.Equals(request[0], "GET", StringComparison.OrdinalIgnoreCase)
                && (request[1] == "/metrics" || request[1].StartsWith(Endpoint, StringComparison.Ordinal));
            byte[] body;
            string status;
            string contentType;
            if (metrics)
            {
                lock (state.Gate) body = Encoding.UTF8.GetBytes(state.Latest ?? "{}");
                status = "200 OK";
                contentType = "application/json";
            }
            else
            {
                body = Encoding.UTF8.GetBytes("not found");
                status = "404 Not Found";
                contentType = "text/plain; charset=utf-8";
            }

            byte[] head = Encoding.ASCII.GetBytes(
                $"HTTP/1.1 {status}\r\nContent-Type: {contentType}\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n");
            await stream.WriteAsync(head);
            await stream.WriteAsync(body);
            await stream.FlushAsync();
        }
    }
}
