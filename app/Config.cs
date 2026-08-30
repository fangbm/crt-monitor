using System.Text.Json;

namespace CrtMonitor;

/// <summary>与前端共享的 config.json：放在 exe 同目录，可选。</summary>
public sealed class Config
{
    public int RefreshMs { get; init; } = 1000;
    public string Theme { get; init; } = "green";
    /// <summary>开发模式：指定 Vite dev server 地址（如 http://localhost:5173）则不加载 wwwroot</summary>
    public string? DevUrl { get; init; }
    public EffectsConfig? Effects { get; init; }
    /// <summary>widget 显示顺序（单页时的布局）；配置了 pages 则忽略
    /// 可用 id 见前端 src/widgets/：cpu / mem / disk / net / proc / clock / weather / sensors</summary>
    public List<string>? Layout { get; init; }
    /// <summary>多页面定义；未配置时前端用默认 SYS/LIFE 两页</summary>
    public List<PageConfig>? Pages { get; init; }
    public WeatherConfig? Weather { get; init; }
    /// <summary>启用 LibreHardwareMonitor（温度/GPU）；未提权时会尝试 UAC 重启自身</summary>
    public bool Lhm { get; init; }
    /// <summary>写 HKCU Run 开机自启。null = 不管理（保持注册表现状）</summary>
    public bool? Autostart { get; init; }
    /// <summary>告警规则；触发后前端红色横幅，可选蜂鸣</summary>
    public List<AlertRule>? Alerts { get; init; }
    public bool AlertSound { get; init; }
    /// <summary>防灼屏微抖：always（默认，整页每30秒±6px漂移）/ idle / off</summary>
    public string Burnin { get; init; } = "always";
    /// <summary>卡片参数（键=卡片 id），如 {"proc":{"count":12},"net":{"nic":"eth0"}}</summary>
    public Dictionary<string, Dictionary<string, object?>>? CardConf { get; init; }
    /// <summary>脚本数据源：运行外部命令，stdout 首行显示为卡片</summary>
    public List<ScriptConfig>? Scripts { get; init; }
    /// <summary>远程机器数据源（对端跑 --serve）</summary>
    public List<RemoteConfig>? Remotes { get; init; }
    /// <summary>Ping 目标：延迟/丢包卡</summary>
    public List<PingConfig>? Pings { get; init; }
    /// <summary>布局预设：整组 pages 方案，P 键循环切换</summary>
    public List<ProfileConfig>? Profiles { get; init; }
    /// <summary>当前布局预设名（切换时写回）</summary>
    public string? Profile { get; init; }
    /// <summary>启用音频频谱卡（WASAPI loopback 采集，少量 CPU）</summary>
    public bool Spectrum { get; init; }
    /// <summary>Web 远看端口（浏览器打开 http://本机IP:端口/）。0 = 关闭</summary>
    public int WebPort { get; init; } = 8080;
    /// <summary>主题定时轮换：时段内自动套用主题（from/to "HH:mm"，支持跨零点）</summary>
    public List<ThemePeriod>? ThemeSchedule { get; init; }
    /// <summary>自启动延迟秒数（开机后等系统稳定再显示窗口）</summary>
    public int StartDelaySec { get; init; }
}

public sealed class ThemePeriod
{
    public string From { get; init; } = "07:00";
    public string To { get; init; } = "19:00";
    public string Theme { get; init; } = "green";
}

public sealed class PingConfig
{
    public string Name { get; init; } = "";
    public string Host { get; init; } = "";
    public int IntervalSec { get; init; } = 2;
}

public sealed class ProfileConfig
{
    public string Name { get; init; } = "";
    public List<PageConfig> Pages { get; init; } = new();
}

public sealed class ScriptConfig
{
    public string Name { get; init; } = "";
    /// <summary>完整命令行（cmd /c 执行），stdout 首行作为值</summary>
    public string Cmd { get; init; } = "";
    /// <summary>执行间隔秒（默认 10）</summary>
    public int IntervalSec { get; init; } = 10;
}

public sealed class RemoteConfig
{
    public string Name { get; init; } = "";
    /// <summary>对端 --serve 地址，如 http://192.168.1.20:9123/metrics/</summary>
    public string Url { get; init; } = "";
}

public sealed class AlertRule
{
    /// <summary>指标路径：cpu.usage / mem.used_pct / mem.swap_used_pct / net.rx_bps / net.tx_bps /
    /// sensors.cpu_temp / sensors.gpu_temp / disk.C.used_pct（挂载点大写）</summary>
    public string Metric { get; init; } = "";
    public string Op { get; init; } = ">";
    public double Value { get; init; }
    /// <summary>持续 N 秒才触发</summary>
    public int Seconds { get; init; } = 10;
    /// <summary>触发后冷却 N 秒不再重复</summary>
    public int Cooldown { get; init; } = 300;
    public string? Label { get; init; }
}

public sealed class PageConfig
{
    public string Name { get; init; } = "PAGE";
    /// <summary>自由布局（新格式）：百分比坐标</summary>
    public List<WidgetPosConfig>? Widgets { get; init; }
    /// <summary>用户主动隐藏的卡片 id（自动补全时跳过）</summary>
    public List<string>? Hidden { get; init; }
    /// <summary>顺序布局（旧格式，读入后前端会转成 widgets；保存时不再写这个字段）</summary>
    public List<string>? Layout { get; init; }
}

public sealed class WidgetPosConfig
{
    public string Id { get; init; } = "";
    public double X { get; init; }
    public double Y { get; init; }
    public double W { get; init; } = 30;
    public double H { get; init; } = 40;
}

public sealed class WeatherConfig
{
    /// <summary>默认启用；无网络时静默重试</summary>
    public bool Enabled { get; init; } = true;
    /// <summary>手动指定坐标（不填则 ip 定位）</summary>
    public double? Lat { get; init; }
    public double? Lon { get; init; }
    /// <summary>地点显示名</summary>
    public string? Place { get; init; }
}

public sealed class EffectsConfig
{
    /// <summary>扫描线不透明度 0-1</summary>
    public double? Scanline { get; init; }
    public bool? Flicker { get; init; }
    /// <summary>暗角强度 0-1</summary>
    public double? Vignette { get; init; }
    /// <summary>屏幕弯曲模拟（圆角 + 玻璃边框）</summary>
    public bool? Curvature { get; init; }

    public static EffectsConfig Default => new()
    {
        Scanline = 0.35,
        Flicker = true,
        Vignette = 0.55,
        Curvature = true,
    };
}

public static class ConfigJson
{
    public static readonly JsonSerializerOptions Web = new(JsonSerializerDefaults.Web);
    public static readonly JsonSerializerOptions Read = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true,
    };
}

public static class ConfigStore
{
    private static string DefaultPath => Path.Combine(AppContext.BaseDirectory, "config.json");

    public static Config Load()
    {
        foreach (var path in Candidates())
        {
            try
            {
                if (File.Exists(path))
                    return JsonSerializer.Deserialize<Config>(File.ReadAllText(path), ConfigJson.Read) ?? new Config();
            }
            catch { /* 配置坏了就继续找下一个/用默认值 */ }
        }
        return new Config();
    }

    /// <summary>布局拖拽后前端回传整份 pages（含当前页），合并写回 config.json（保留其他字段原样）。
    /// 配置了 profile 时，写回对应 profile 的 pages，而不是误写到被忽略的顶层 pages。</summary>
    public static void SavePages(List<PageConfig> pages, string? profileName = null)
    {
        try
        {
            string path = Candidates().FirstOrDefault(File.Exists) ?? DefaultPath;
            var root = (File.Exists(path)
                ? System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(path))
                : new System.Text.Json.Nodes.JsonObject()) as System.Text.Json.Nodes.JsonObject
                ?? new System.Text.Json.Nodes.JsonObject();
            bool savedToProfile = false;
            if (!string.IsNullOrWhiteSpace(profileName)
                && root["profiles"] is System.Text.Json.Nodes.JsonArray profiles)
            {
                foreach (var node in profiles.OfType<System.Text.Json.Nodes.JsonObject>())
                {
                    if (!string.Equals(node["name"]?.GetValue<string>(), profileName, StringComparison.OrdinalIgnoreCase))
                        continue;
                    node["pages"] = JsonSerializer.SerializeToNode(pages, ConfigJson.Web);
                    savedToProfile = true;
                    break;
                }
            }
            if (!savedToProfile)
            {
                root["pages"] = JsonSerializer.SerializeToNode(pages, ConfigJson.Web);
                root.Remove("layout"); // pages 与 layout 互斥，避免歧义
            }
            File.WriteAllText(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            Program.Log($"pages saved{(savedToProfile ? $" for profile {profileName}" : "")}: {string.Join(" | ", pages.Select(p => $"{p.Name} [{p.Widgets?.Count ?? 0} widgets]"))}");
        }
        catch (Exception ex)
        {
            Program.Log($"save pages failed: {ex.Message}");
        }
    }

    /// <summary>切换自启动；返回切换后的状态。</summary>
    public static bool ToggleAutostart()
    {
        string path = Candidates().FirstOrDefault(File.Exists) ?? DefaultPath;
        System.Text.Json.Nodes.JsonNode? root =
            File.Exists(path)
                ? System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(path))
                : new System.Text.Json.Nodes.JsonObject();
        bool next = !(root!["autostart"]?.GetValue<bool>() ?? false);
        root["autostart"] = next;
        File.WriteAllText(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        Program.Log($"autostart -> {next}");
        return next;
    }

    /// <summary>通用配置项写入（保留其他字段原样），用于 set-theme 等持久化。</summary>
    public static void SetValue(string key, System.Text.Json.Nodes.JsonNode? value)
    {
        try
        {
            string path = Candidates().FirstOrDefault(File.Exists) ?? DefaultPath;
            var root = File.Exists(path)
                ? System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(path))
                : new System.Text.Json.Nodes.JsonObject();
            root![key] = value;
            File.WriteAllText(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            Program.Log($"config set {key}");
        }
        catch (Exception ex)
        {
            Program.Log($"config set {key} failed: {ex.Message}");
        }
    }

    /// <summary>设置面板保存：把局部配置对象（顶层键）深度合并进 config.json。</summary>
    public static void Merge(JsonElement partial)
    {
        try
        {
            string path = Candidates().FirstOrDefault(File.Exists) ?? DefaultPath;
            var root = File.Exists(path)
                ? System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(path))!
                : new System.Text.Json.Nodes.JsonObject();
            foreach (var prop in partial.EnumerateObject())
                root[prop.Name] = System.Text.Json.Nodes.JsonNode.Parse(prop.Value.GetRawText());
            File.WriteAllText(path, root.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            Program.Log("config merged (settings panel)");
        }
        catch (Exception ex)
        {
            Program.Log($"config merge failed: {ex.Message}");
        }
    }

    private static IEnumerable<string> Candidates()
    {
        yield return Path.Combine(AppContext.BaseDirectory, "config.json");
        yield return Path.Combine(Environment.CurrentDirectory, "config.json");
    }
}
