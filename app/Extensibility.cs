using System.IO;
using System.Reflection;
using CrtMonitor.Collectors;
using System.Text.Json;

namespace CrtMonitor;

public sealed class ThemeFile
{
    public string Id { get; init; } = "";
    public string Name { get; init; } = "";
    public Dictionary<string, string> Vars { get; init; } = new();
    /// <summary>主题自带的特效参数（可选）：切到该主题时覆盖全局 effects</summary>
    public EffectsConfig? Effects { get; init; }
}

public static class ThemeStore
{
    /// <summary>扫描 exe 同目录 themes/*.json（{"id","name","vars":{"--phos":"#..",...}}）。</summary>
    public static List<ThemeFile> Scan(string dir)
    {
        var themes = new List<ThemeFile>();
        try
        {
            var file = Path.Combine(dir, "themes");
            if (!Directory.Exists(file)) return themes;
            foreach (var json in Directory.GetFiles(file, "*.json"))
            {
                try
                {
                    var t = JsonSerializer.Deserialize<ThemeFile>(File.ReadAllText(json), ConfigJson.Read);
                    if (t is { Id.Length: > 0, Vars.Count: > 0 }) themes.Add(t);
                }
                catch (Exception ex)
                {
                    Program.Log($"theme invalid {json}: {ex.Message}");
                }
            }
        }
        catch { /* 目录不可读就算了 */ }
        return themes;
    }
}

public static class PluginLoader
{
    /// <summary>加载 plugins/*.dll 里的 ICollector 实现（反射），并列出 plugins/*.js 给前端动态 import。</summary>
    public static (List<ICollector> collectors, List<string> scripts) Load(string dir)
    {
        var collectors = new List<ICollector>();
        var scripts = new List<string>();
        try
        {
            if (!Directory.Exists(dir)) return (collectors, scripts);
            foreach (var dll in Directory.GetFiles(dir, "*.dll"))
            {
                try
                {
                    var asm = Assembly.LoadFrom(dll);
                    foreach (var type in asm.GetTypes()
                                 .Where(t => typeof(ICollector).IsAssignableFrom(t) && t is { IsAbstract: false, IsInterface: false }))
                    {
                        collectors.Add((ICollector)Activator.CreateInstance(type)!);
                    }
                    Program.Log($"plugin loaded: {Path.GetFileName(dll)}");
                }
                catch (Exception ex)
                {
                    Program.Log($"plugin failed {Path.GetFileName(dll)}: {ex.Message}");
                }
            }
            scripts.AddRange(Directory.GetFiles(dir, "*.js").Select(Path.GetFileName)!);
        }
        catch (Exception ex)
        {
            Program.Log($"plugin scan failed: {ex.Message}");
        }
        return (collectors, scripts);
    }
}
