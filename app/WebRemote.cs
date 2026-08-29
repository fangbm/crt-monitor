using System.Net;
using System.Net.Sockets;
using System.Text;

namespace CrtMonitor;

/// <summary>Web 远看：TcpListener 手写极简 HTTP（绕开 HTTP.sys 的 URL ACL 管理员要求），
/// 提供 wwwroot 静态页 + SSE 实时推送（config 即时 / tick 每秒 / history 每 60 帧）。
/// 只读视图：不暴露任何命令。config "web_port"（0 = 关闭）。</summary>
public sealed class WebRemote : IDisposable
{
    private static readonly Dictionary<string, string> Mime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json",
        [".png"] = "image/png",
        [".svg"] = "image/svg+xml",
        [".ico"] = "image/x-icon",
        [".woff2"] = "font/woff2",
    };

    private readonly Func<string?> _latestTick;
    private readonly Func<string?> _config;
    private readonly Func<string?> _history;
    private readonly string _wwwroot;
    private readonly int _port;
    private TcpListener? _listener;
    private readonly List<NetworkStream> _sseClients = new();
    private readonly object _gate = new();
    private System.Threading.Timer? _pushTimer;

    public WebRemote(int port, string wwwroot, Func<string?> latestTick, Func<string?> config, Func<string?> history)
    {
        _port = port;
        _wwwroot = wwwroot;
        _latestTick = latestTick;
        _config = config;
        _history = history;
    }

    public void Start()
    {
        try
        {
            _listener = new TcpListener(IPAddress.Any, _port);
            _listener.Start();
            Task.Run(AcceptLoop);
            // SSE 推送：GUI 的 PushTick 节奏是 RefreshMs；这里独立 1s 推
            _pushTimer = new System.Threading.Timer(_ => PushToSse(), null, 1000, 1000);
            Program.Log($"web remote on http://*:{_port}/");
        }
        catch (Exception ex)
        {
            Program.Log($"web remote failed: {ex.Message}");
        }
    }

    private async Task AcceptLoop()
    {
        while (true)
        {
            TcpClient client;
            try
            {
                client = await _listener!.AcceptTcpClientAsync();
            }
            catch
            {
                break; // listener stopped
            }
            _ = Task.Run(() => Handle(client));
        }
    }

    private async Task Handle(TcpClient client)
    {
        NetworkStream stream = client.GetStream();
        var reader = new StreamReader(stream, Encoding.ASCII, false, 4096, leaveOpen: true);
        string? requestLine = await reader.ReadLineAsync();
        if (string.IsNullOrEmpty(requestLine))
        {
            client.Dispose();
            return;
        }
        while (!string.IsNullOrEmpty(await reader.ReadLineAsync())) { }

        string path = requestLine.Split(' ')[1] switch
        {
            "/" => "/index.html",
            var p => p.Split('?')[0],
        };

        if (path == "/events")
        {
            await ServeSse(stream); // 流的所有权移交 _sseClients（PushToSse 负责清理）
            return;
        }

        try
        {
            if (path == "/config")
            {
                await WriteBytes(stream, 200, "application/json", Encoding.UTF8.GetBytes(_config() ?? "{}"));
                return;
            }
            await ServeStatic(stream, path);
        }
        finally
        {
            client.Dispose();
        }
    }

    private async Task ServeSse(NetworkStream stream)
    {
        string head = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\n";
        byte[] headBytes = Encoding.UTF8.GetBytes(head);
        await stream.WriteAsync(headBytes);
        await stream.FlushAsync();
        lock (_gate) _sseClients.Add(stream);
        // 首条 config 即时下发（远端页面打开即有主题/布局）
        byte[] cfg = Encoding.UTF8.GetBytes($"data: {_config() ?? "{}"}\n\n");
        await stream.WriteAsync(cfg);
        await stream.FlushAsync();
        // 不挂起本任务：连接由 PushToSse 驱动，断开时其写失败 → 移除并释放
    }

    private async void PushToSse()
    {
        string tick = _latestTick() ?? "{}";
        string? history = null;
        _frame++;
        if (_frame % 60 == 0) history = _history();
        List<NetworkStream> snapshot;
        lock (_gate) snapshot = new List<NetworkStream>(_sseClients);

        var payloads = new List<byte[]> { Encoding.UTF8.GetBytes($"data: {tick}\n\n") };
        if (history is not null)
            payloads.Add(Encoding.UTF8.GetBytes($"data: {history}\n\n"));

        foreach (var s in snapshot)
        {
            try
            {
                foreach (var p in payloads)
                    await s.WriteAsync(p);
                await s.FlushAsync();
            }
            catch
            {
                lock (_gate) _sseClients.Remove(s);
                try { s.Dispose(); } catch { }
            }
        }
    }

    private int _frame;

    private async Task ServeStatic(NetworkStream stream, string path)
    {
        // 防目录穿越
        string rel = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
        string full = Path.GetFullPath(Path.Combine(_wwwroot, rel));
        if (!full.StartsWith(Path.GetFullPath(_wwwroot), StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
        {
            await WriteBytes(stream, 404, "text/plain", Encoding.UTF8.GetBytes("not found"));
            return;
        }
        string ext = Path.GetExtension(full);
        Mime.TryGetValue(ext, out var mime);
        await WriteBytes(stream, 200, mime ?? "application/octet-stream", await File.ReadAllBytesAsync(full));
    }

    private static async Task WriteBytes(NetworkStream stream, int status, string contentType, byte[] body)
    {
        string head = $"HTTP/1.1 {status} OK\r\nContent-Type: {contentType}\r\nContent-Length: {body.Length}\r\nConnection: close\r\n\r\n";
        await stream.WriteAsync(Encoding.UTF8.GetBytes(head));
        await stream.WriteAsync(body);
        await stream.FlushAsync();
    }

    public void Dispose()
    {
        _pushTimer?.Dispose();
        try { _listener?.Stop(); } catch { }
        lock (_gate)
        {
            foreach (var s in _sseClients)
            {
                try { s.Dispose(); } catch { }
            }
            _sseClients.Clear();
        }
    }
}
