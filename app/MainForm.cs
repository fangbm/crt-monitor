using System.Text.Json;
using Microsoft.Web.WebView2.WinForms;

namespace CrtMonitor;

/// <summary>无边框全屏窗口（优先副屏）+ WebView2 承载前端。</summary>
public sealed class MainForm : Form
{
    private readonly Config _cfg;
    private readonly WebView2 _web = new();
    private readonly Scheduler _scheduler;
    private readonly System.Windows.Forms.Timer _timer = new();
    private readonly List<ThemeFile> _themes;
    private readonly List<string> _pluginScripts;
    private readonly TrayService _tray;
    private bool _fullscreen = true;
    private bool _userHidden;
    private Rectangle _restoreBounds;

    public MainForm(Config cfg)
    {
        _cfg = cfg;
        _themes = ThemeStore.Scan(AppContext.BaseDirectory);
        var (pluginCollectors, scripts) = PluginLoader.Load(Path.Combine(AppContext.BaseDirectory, "plugins"));
        _pluginScripts = scripts;
        _scheduler = new Scheduler(cfg, pluginCollectors, msg => _tray.ShowBalloon("CRT-Monitor 告警", msg));
        _tray = new TrayService(this, () => Array.IndexOf(Screen.AllScreens, PickScreen()));

        FormBorderStyle = FormBorderStyle.None;
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        if (!RestoreWindowState())
            Bounds = PickScreen().Bounds;

        _web.Dock = DockStyle.Fill;
        Controls.Add(_web);

        _timer.Interval = Math.Max(250, _cfg.RefreshMs);
        _timer.Tick += (s, e) => PushTick();

        Load += async (_, _) => await InitWebViewAsync();
        KeyPreview = true;
        KeyDown += OnShellHotkey;
        FormClosed += (_, _) =>
        {
            _timer.Stop();
            _scheduler.Dispose();
            _tray.Dispose();
            SaveWindowState();
        };
    }

    /// <summary>窗口状态记忆：屏幕序号，windowstate.json。返回是否成功恢复。</summary>
    private bool RestoreWindowState()
    {
        try
        {
            string path = Path.Combine(AppContext.BaseDirectory, "windowstate.json");
            if (!File.Exists(path)) return false;
            using var doc = System.Text.Json.JsonDocument.Parse(File.ReadAllText(path));
            if (!doc.RootElement.TryGetProperty("screen", out var s) || !s.TryGetInt32(out int screen)) return false;
            if (screen < 0 || screen >= Screen.AllScreens.Length) return false;
            Bounds = Screen.AllScreens[screen].Bounds;
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// 壳级快捷键：焦点不在 WebView（窗口刚启动/点了非页面区域）时，页面收不到 keydown，
    /// 这里把字母/数字快捷键转发给页面的 __hotkey 统一入口。WebView 有焦点时不会走到这里。
    /// </summary>
    private void OnShellHotkey(object? sender, KeyEventArgs e)
    {
        string? code = e.KeyCode switch
        {
            Keys.E => "KeyE",
            Keys.C => "KeyC",
            Keys.T => "KeyT",
            Keys.R => "KeyR",
            Keys.A => "KeyA",
            Keys.D1 or Keys.NumPad1 => "Digit1",
            Keys.D2 or Keys.NumPad2 => "Digit2",
            Keys.D3 or Keys.NumPad3 => "Digit3",
            _ => null,
        };
        if (code is not null)
        {
            e.Handled = true;
            _web.CoreWebView2?.ExecuteScriptAsync($"window.__hotkey && window.__hotkey('{code}')");
        }
        else if (e.KeyCode == Keys.F11)
        {
            e.Handled = true;
            ToggleFullscreen();
        }
        else if (e.KeyCode == Keys.Escape)
        {
            e.Handled = true;
            HideToTray();
        }
    }

    private void HideToTray()
    {
        _restoreBounds = Bounds;
        _userHidden = true;
        Hide();
    }

    /// <summary>截取当前页面到 图片\CRT-Monitor\，完成后回发文件名给前端提示。</summary>
    private async Task CaptureScreenshotAsync()
    {
        try
        {
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "CRT-Monitor");
            Directory.CreateDirectory(dir);
            string file = Path.Combine(dir, $"crt-{DateTime.Now:yyyyMMdd-HHmmss}.png");
            await _web.CoreWebView2.CapturePreviewAsync(
                Microsoft.Web.WebView2.Core.CoreWebView2CapturePreviewImageFormat.Png,
                new FileStream(file, FileMode.Create));
            Program.Log($"screenshot saved: {file}");
            _web.CoreWebView2?.PostWebMessageAsJson(
                JsonSerializer.Serialize(new Dictionary<string, object?>
                {
                    ["type"] = "notice",
                    ["text"] = $"SCREENSHOT → {Path.GetFileName(file)}",
                }, ConfigJson.Web));
        }
        catch (Exception ex)
        {
            Program.Log($"screenshot failed: {ex.Message}");
        }
    }

    /// <summary>窗口状态记忆：屏幕序号 + 全屏与否，windowstate.json。</summary>
    private void SaveWindowState()
    {
        try
        {
            var state = new Dictionary<string, object?>
            {
                ["screen"] = Array.IndexOf(Screen.AllScreens, PickScreen()),
                ["fullscreen"] = _fullscreen,
            };
            File.WriteAllText(
                Path.Combine(AppContext.BaseDirectory, "windowstate.json"),
                System.Text.Json.JsonSerializer.Serialize(state, ConfigJson.Web));
        }
        catch { /* 记不住就算了 */ }
    }

    private static Screen PickScreen()
    {
        var screens = Screen.AllScreens;
        return screens.Length > 1 ? screens[1] : screens[0];
    }

    private async Task InitWebViewAsync()
    {
        await _web.EnsureCoreWebView2Async();
        var core = _web.CoreWebView2;

        // 渲染进程崩溃后自动重载（config 重发会自愈前端状态）
        core.ProcessFailed += (_, args) =>
        {
            Program.Log($"webview process failed: {args.ProcessFailedKind}, reloading");
            try { core.Reload(); } catch { /* 重载失败等下次 */ }
        };

        // 关键：清掉 HTTP 缓存。虚拟域 (app.local) 的 index.html 会被 WebView2 缓存，
        // 升级构建后可能仍加载旧前端，导致"新功能时有时无"的灵异行为。
        try { await core.Profile.ClearBrowsingDataAsync(); } catch { /* 忽略清理失败 */ }

        var settings = core.Settings;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = _cfg.DevUrl is not null;
        settings.IsZoomControlEnabled = false;
        settings.IsStatusBarEnabled = false;

        core.WebMessageReceived += OnWebMessage;

        var query = $"?theme={Uri.EscapeDataString(_cfg.Theme)}";
        core.NavigationCompleted += (_, _) =>
        {
            // config 每次导航完成都要重发：页面 reload（渲染进程崩溃恢复等）后
            // 前端主题目录/布局会回到默认，靠这条消息自愈。
            core.PostWebMessageAsJson(ConfigMessageJson());
            if (!_timer.Enabled)
            {
                _web.Focus(); // 首次加载把键盘焦点交给页面
                _timer.Start();
                PushTick(); // 首拍，避免白屏等待一个 interval
            }
        };
        if (_cfg.DevUrl is { } devUrl)
        {
            core.Navigate(devUrl + query);
        }
        else
        {
            string wwwroot = Path.Combine(AppContext.BaseDirectory, "wwwroot");
            core.SetVirtualHostNameToFolderMapping(
                "app.local", wwwroot,
                Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow);
            string plugins = Path.Combine(AppContext.BaseDirectory, "plugins");
            if (Directory.Exists(plugins))
                core.SetVirtualHostNameToFolderMapping(
                    "plugins.local", plugins,
                    Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind.Allow);
            core.Navigate($"https://app.local/index.html?b={Environment.TickCount64}{query}");
        }
    }

    private string ConfigMessageJson()
    {
        var msg = new Dictionary<string, object?>
        {
            ["type"] = "config",
            ["theme"] = _cfg.Theme,
            ["effects"] = _cfg.Effects is null ? null : new Dictionary<string, object?>
            {
                ["scanline"] = _cfg.Effects.Scanline,
                ["flicker"] = _cfg.Effects.Flicker,
                ["vignette"] = _cfg.Effects.Vignette,
                ["curvature"] = _cfg.Effects.Curvature,
            },
            ["pages"] = _cfg.Pages,
            ["autostart"] = _cfg.Autostart ?? false,
            ["themes"] = _themes,
            ["plugins"] = _pluginScripts,
            ["burnin"] = string.IsNullOrWhiteSpace(_cfg.Burnin) ? "always" : _cfg.Burnin,
            ["cardconf"] = _scheduler.CardConf,
        };
        return JsonSerializer.Serialize(msg, ConfigJson.Web);
    }

    /// <summary>前端 → 壳的命令：toggle-fullscreen / quit / reload / save-layout</summary>
    private void OnWebMessage(object? sender, Microsoft.Web.WebView2.Core.CoreWebView2WebMessageReceivedEventArgs e)
    {
        string? raw = e.TryGetWebMessageAsString();
        if (string.IsNullOrEmpty(raw)) return;
        try
        {
            using var doc = JsonDocument.Parse(raw);
            if (!doc.RootElement.TryGetProperty("cmd", out var cmd)) return;
            switch (cmd.GetString())
            {
                case "toggle-fullscreen":
                    ToggleFullscreen();
                    break;
                case "quit":
                    Close();
                    break;
                case "reload":
                    _web.CoreWebView2?.Reload();
                    break;
                case "save-pages":
                    if (doc.RootElement.TryGetProperty("value", out var pagesEl)
                        && pagesEl.ValueKind == JsonValueKind.Array)
                    {
                        var pages = pagesEl.Deserialize<List<PageConfig>>(ConfigJson.Web);
                        if (pages is { Count: > 0 }) ConfigStore.SavePages(pages);
                    }
                    break;
                case "set-theme":
                    if (doc.RootElement.TryGetProperty("value", out var themeEl)
                        && themeEl.ValueKind == JsonValueKind.String)
                    {
                        ConfigStore.SetValue("theme", System.Text.Json.Nodes.JsonValue.Create(themeEl.GetString()));
                        Program.Log($"theme -> {themeEl.GetString()}");
                    }
                    break;
                case "screenshot":
                    _ = CaptureScreenshotAsync();
                    break;
                case "key-debug":
                    break;
                case "toggle-autostart":
                    bool on = ConfigStore.ToggleAutostart();
                    Program.ApplyAutostart(on);
                    _web.CoreWebView2?.PostWebMessageAsJson(
                        JsonSerializer.Serialize(new Dictionary<string, object?>
                        {
                            ["type"] = "autostart",
                            ["value"] = on,
                        }, ConfigJson.Web));
                    break;
            }
        }
        catch (JsonException) { /* 非 JSON 消息忽略 */ }
    }

    private void ToggleFullscreen()
    {
        var screen = PickScreen().Bounds;
        if (_fullscreen)
        {
            _restoreBounds = Bounds;
            FormBorderStyle = FormBorderStyle.Sizable;
            WindowState = FormWindowState.Normal;
            Bounds = new Rectangle(
                screen.X + Math.Max(0, (screen.Width - 1280) / 2),
                screen.Y + Math.Max(0, (screen.Height - 800) / 2),
                Math.Min(1280, screen.Width), Math.Min(800, screen.Height));
            _fullscreen = false;
        }
        else
        {
            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal;
            Bounds = _restoreBounds.Width > 0 ? _restoreBounds : screen;
            _fullscreen = true;
        }
    }

    private void PushTick()
    {
        if (_web.CoreWebView2 is not { } core) return;
        string? json = _scheduler.CollectJson();
        if (json is not null)
        {
            core.PostWebMessageAsJson(json);
            if (json.Contains("\"cpu\":") && _scheduler.LastCpuPercent is { } cpu)
                _tray.UpdateCpu(cpu);
        }
        if (_scheduler.ShouldPushHistory() && _scheduler.HistoryJson() is { } history)
            core.PostWebMessageAsJson(history);
    }
}
