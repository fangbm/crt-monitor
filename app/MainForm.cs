using System.Runtime.InteropServices;
using System.Text.Json;
using CrtMonitor.Collectors;
using Microsoft.Web.WebView2.WinForms;

namespace CrtMonitor;

/// <summary>无边框全屏窗口（优先副屏）+ WebView2 承载前端。</summary>
public sealed class MainForm : Form
{
    [DllImport("user32.dll")]
    private static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

    private const int WM_NCLBUTTONDOWN = 0xA1;
    private const int HTCAPTION = 0x2;
    private Config _cfg;
    private readonly WebView2 _web = new();
    private Scheduler _scheduler = null!;
    private readonly System.Windows.Forms.Timer _timer = new();
    private List<ThemeFile> _themes;
    private readonly List<string> _pluginScripts;
    private readonly List<ICollector> _pluginCollectors;
    private readonly HistoryService _history = new();
    private LhmCollector? _lhm;
    private SpectrumCollector? _spectrum;
    private WebRemote? _webRemote;
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
        _pluginCollectors = pluginCollectors;
        _tray = new TrayService(this, () => Array.IndexOf(Screen.AllScreens, PickScreen()));
        _scheduler = BuildScheduler();

        FormBorderStyle = FormBorderStyle.None;
        Text = "CRT-Monitor"; // 窗口化时 Alt+Tab 有名字
        BackColor = Color.Black; // 消除 WebView2 首次渲染前的白闪
        StartPosition = FormStartPosition.Manual;
        ShowInTaskbar = false;
        if (!RestoreWindowState())
            Bounds = PickScreen().Bounds;

        _web.Dock = DockStyle.Fill;
        _web.DefaultBackgroundColor = Color.Black; // 同上：控件自身的默认底色
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
            _lhm?.Dispose();
            _spectrum?.Dispose();
            _history.Dispose();
            _tray.Dispose();
            _webRemote?.Dispose();
            SaveWindowState();
        };

        UpdateChecker.Start(msg => _tray.ShowBalloon("CRT-Monitor", msg));

        // Web 远看：浏览器打开 http://本机IP:端口/ 实时查看（只读）
        if (_cfg.WebPort > 0)
        {
            _webRemote = new WebRemote(
                _cfg.WebPort,
                Path.Combine(AppContext.BaseDirectory, "wwwroot"),
                () => _lastTickJson,
                ConfigMessageJson,
                () => _scheduler.HistoryJson());
            _webRemote.Start();
        }
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
            using (var stream = new FileStream(file, FileMode.Create))
            {
                await _web.CoreWebView2.CapturePreviewAsync(
                    Microsoft.Web.WebView2.Core.CoreWebView2CapturePreviewImageFormat.Png,
                    stream);
            }
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

    /// <summary>保护名单：杀掉会蓝屏/失去桌面的系统进程，监控自身也不许。</summary>
    private static readonly HashSet<string> ProtectedProcs = new(StringComparer.OrdinalIgnoreCase)
    {
        "system", "idle", "csrss", "smss", "wininit", "winlogon", "services", "lsass",
        "svchost", "explorer", "dwm", "fontdrvhost", "crtmonitor",
    };

    private void KillProcess(string rawName)
    {
        // 前端传的是展示名（可能带 " x3" 合并后缀）
        string name = rawName.Split(" x")[0].Trim();
        void Reply(string text) => _web.CoreWebView2?.PostWebMessageAsJson(
            JsonSerializer.Serialize(new Dictionary<string, object?> { ["type"] = "notice", ["text"] = text }, ConfigJson.Web));

        if (ProtectedProcs.Contains(name))
        {
            Program.Log($"kill denied (protected): {name}");
            Reply($"⛔ {name.ToUpper()} PROTECTED");
            return;
        }
        try
        {
            var procs = System.Diagnostics.Process.GetProcessesByName(name);
            if (procs.Length == 0)
            {
                Reply($"{name.ToUpper()} NOT FOUND");
                return;
            }
            int killed = 0;
            foreach (var p in procs)
            {
                try
                {
                    p.Kill(entireProcessTree: true);
                    killed++;
                }
                catch { /* 已退出/无权限 */ }
                finally
                {
                    p.Dispose();
                }
            }
            Program.Log($"kill {name}: {killed}/{procs.Length}");
            Reply($"KILLED {name.ToUpper()} x{killed}");
        }
        catch (Exception ex)
        {
            Program.Log($"kill {name} failed: {ex.Message}");
            Reply($"KILL FAILED: {name.ToUpper()}");
        }
    }

    private volatile string _lastTickJson = "{}";

    /// <summary>导出 24h 历史 CSV 到 图片\CRT-Monitor\。</summary>
    private void ExportHistoryCsv()
    {
        try
        {
            string csv = _scheduler.HistoryCsv() ?? "";
            string dir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "CRT-Monitor");
            Directory.CreateDirectory(dir);
            string file = Path.Combine(dir, $"history-{DateTime.Now:yyyyMMdd-HHmm}.csv");
            File.WriteAllText(file, csv);
            Program.Log($"history exported: {file}");
            _web.CoreWebView2?.PostWebMessageAsJson(
                JsonSerializer.Serialize(new Dictionary<string, object?>
                {
                    ["type"] = "notice",
                    ["text"] = $"CSV → {Path.GetFileName(file)}",
                }, ConfigJson.Web));
        }
        catch (Exception ex)
        {
            Program.Log($"export csv failed: {ex.Message}");
        }
    }

    /// <summary>布局预设切换：写回 profile 字段，重载配置后重发 config（前端换页组）。</summary>
    private void SwitchProfile()
    {
        try
        {
            var names = _cfg.Profiles?.Select(p => p.Name).ToList();
            if (names is not { Count: > 1 })
            {
                Program.Log("switch-profile: no profiles configured");
                return;
            }
            int idx = Math.Max(0, names.IndexOf(_cfg.Profile ?? ""));
            string next = names[(idx + 1) % names.Count];
            ConfigStore.SetValue("profile", System.Text.Json.Nodes.JsonValue.Create(next));
            _cfg = ConfigStore.Load();
            _web.CoreWebView2?.PostWebMessageAsJson(ConfigMessageJson());
            Program.Log($"profile -> {next}");
        }
        catch (Exception ex)
        {
            Program.Log($"switch profile failed: {ex.Message}");
        }
    }

    /// <summary>主题编辑器保存：写 themes/{id}.json，刷新扫描列表（前端已本地应用）。</summary>
    private void SaveTheme(JsonElement root)
    {
        try
        {
            if (!root.TryGetProperty("value", out var v)) return;
            string id = v.GetProperty("id").GetString() ?? "";
            string name = v.GetProperty("name").GetString() ?? id;
            var vars = new Dictionary<string, string>();
            foreach (var prop in v.GetProperty("vars").EnumerateObject())
                vars[prop.Name] = prop.Value.GetString() ?? "";
            if (id.Length == 0 || vars.Count == 0) return;

            string file = Path.Combine(AppContext.BaseDirectory, "themes", $"{id}.json");
            File.WriteAllText(file, JsonSerializer.Serialize(new ThemeFile { Id = id, Name = name, Vars = vars }, ConfigJson.Web));
            _themes = ThemeStore.Scan(AppContext.BaseDirectory);
            Program.Log($"theme saved: {id}");
        }
        catch (Exception ex)
        {
            Program.Log($"save theme failed: {ex.Message}");
        }
    }

    /// <summary>按当前 _cfg 组装采集器列表并创建调度器（LHM/频谱实例复用，历史共享）。</summary>
    private Scheduler BuildScheduler()
    {
        if (_cfg.Lhm && _lhm is null) _lhm = new LhmCollector(enabled: true);
        if (!_cfg.Lhm) { _lhm?.Dispose(); _lhm = null; }
        if (_cfg.Spectrum && _spectrum is null) _spectrum = new SpectrumCollector(enabled: true);
        if (!_cfg.Spectrum) { _spectrum?.Dispose(); _spectrum = null; }

        var collectors = new List<ICollector>
        {
            new CpuMemCollector(),
            new DiskCollector(),
            new NetCollector(),
            new ProcessCollector(),
            new WeatherCollector(_cfg.Weather),
            new MediaCollector(),
            new ScriptCollector(_cfg.Scripts),
            new RemoteCollector(_cfg.Remotes),
            new PingCollector(_cfg.Pings),
            new EventsCollector(),
        };
        if (_lhm is not null) collectors.Add(_lhm);
        if (_spectrum is not null) collectors.Add(_spectrum);
        collectors.AddRange(_pluginCollectors);

        return new Scheduler(collectors, _cfg, msg => _tray.ShowBalloon("CRT-Monitor 告警", msg), _history);
    }

    /// <summary>设置面板保存：合并写回 config.json → 重建调度器/远看服务 → 重发 config。</summary>
    private void ApplySettings(JsonElement partial)
    {
        try
        {
            ConfigStore.Merge(partial);
            int oldPort = _cfg.WebPort;
            _cfg = ConfigStore.Load();

            _timer.Stop();
            _scheduler.Dispose();
            _scheduler = BuildScheduler();
            _timer.Interval = Math.Max(250, _cfg.RefreshMs);
            _timer.Start();

            if (_cfg.WebPort != oldPort)
            {
                _webRemote?.Dispose();
                _webRemote = null;
                if (_cfg.WebPort > 0)
                {
                    _webRemote = new WebRemote(
                        _cfg.WebPort,
                        Path.Combine(AppContext.BaseDirectory, "wwwroot"),
                        () => _lastTickJson,
                        ConfigMessageJson,
                        () => _scheduler.HistoryJson());
                    _webRemote.Start();
                }
            }

            // 自启动开关也在设置面板里：注册表同步（A 键走的是另一条命令）
            Program.ApplyAutostart(_cfg.Autostart ?? false);

            Program.Log("settings applied");
            _web.CoreWebView2?.PostWebMessageAsJson(ConfigMessageJson());
        }
        catch (Exception ex)
        {
            Program.Log($"apply settings failed: {ex.Message}");
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
            ["profiles"] = _cfg.Profiles?.Select(p => p.Name).ToList(),
            ["profile"] = _cfg.Profile,
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
                case "set-volume":
                    if (doc.RootElement.TryGetProperty("value", out var volEl)
                        && volEl.TryGetInt32(out int vol))
                    {
                        AudioVolume.Set(vol);
                    }
                    break;
                case "kill-proc":
                    if (doc.RootElement.TryGetProperty("value", out var procEl)
                        && procEl.ValueKind == JsonValueKind.String)
                    {
                        KillProcess(procEl.GetString() ?? "");
                    }
                    break;
                case "switch-profile":
                    SwitchProfile();
                    break;
                case "save-theme":
                    SaveTheme(doc.RootElement);
                    break;
                case "save-settings":
                    if (doc.RootElement.TryGetProperty("value", out var settingsEl)
                        && settingsEl.ValueKind == JsonValueKind.Object)
                    {
                        ApplySettings(settingsEl.Clone());
                    }
                    break;
                case "export-csv":
                    ExportHistoryCsv();
                    break;
                case "drag-window":
                    // 无边框窗口的标题栏拖拽：前端顶栏 pointerdown 转发过来
                    ReleaseCapture();
                    SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, IntPtr.Zero);
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
            _lastTickJson = json; // Web 远看复用同一份，避免并发采集
            core.PostWebMessageAsJson(json);
            if (json.Contains("\"cpu\":") && _scheduler.LastCpuPercent is { } cpu)
                _tray.UpdateCpu(cpu);
        }
        if (_scheduler.ShouldPushHistory() && _scheduler.HistoryJson() is { } history)
            core.PostWebMessageAsJson(history);
    }
}
