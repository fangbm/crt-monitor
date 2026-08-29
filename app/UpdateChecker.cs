using System.Net.Http;
using System.Reflection;

namespace CrtMonitor;

/// <summary>更新检查：GitHub Releases 最新 tag 对比本地版本，有新版托盘气泡提示。
/// 网络不通静默跳过，6 小时重试。</summary>
public static class UpdateChecker
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(8) };
    private static readonly string Api = "https://api.github.com/repos/fangbm/crt-monitor/releases/latest";

    public static void Start(Action<string> notify)
    {
        Task.Run(() => Loop(notify));
    }

    private static async Task Loop(Action<string> notify)
    {
        while (true)
        {
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, Api);
                req.Headers.UserAgent.ParseAdd("crt-monitor");
                using var res = await Http.SendAsync(req);
                var json = await res.Content.ReadAsStringAsync();
                using var doc = System.Text.Json.JsonDocument.Parse(json);
                string tag = doc.RootElement.GetProperty("tag_name").GetString()?.TrimStart('v') ?? "";
                string local = Assembly.GetEntryAssembly()!.GetName().Version!.ToString(3);
                if (Version.TryParse(tag, out var remote) && remote > Version.Parse(local))
                {
                    notify($"新版本 v{tag} 可用（当前 v{local}），GitHub Releases 页下载");
                    Program.Log($"update available: v{tag} > v{local}");
                }
            }
            catch
            {
                // 无网/GitHub 不可达：静默，下轮再试
            }
            await Task.Delay(TimeSpan.FromHours(6));
        }
    }
}
