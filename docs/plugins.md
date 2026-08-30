# CRT-Monitor 插件开发指南

CRT-Monitor 的扩展有两个维度：**C# 数据采集器**（往 `metrics` 里塞数据）和**前端卡片**（把数据画出来）。两者可独立使用，也可配对做成完整功能。

运行目录结构：

```
CrtMonitor.exe
├─ plugins/          ← C# 采集器 DLL + 前端 JS 卡片
├─ themes/           ← 主题 JSON
└─ wwwroot/          ← 内置前端（勿动）
```

## 一、前端卡片（plugins/*.js）

最简单的扩展方式。`plugins/` 下放一个 ES Module JS 文件，启动时自动经 `https://plugins.local/` 动态加载：

```js
// plugins/mycard.js
(function () {
  const CRT = globalThis.CRT;
  if (!CRT) throw new Error("host not found");

  CRT.registerWidget({
    id: "mycard",          // 唯一 id
    title: "MY CARD",      // 卡片管理器显示名
    span: 2,               // 默认宽度参考
    create(host) {
      // host = 卡片容器 <section>，往里建 DOM
      const head = document.createElement("div");
      head.className = "w-head";
      head.textContent = "MY CARD";
      const big = document.createElement("div");
      big.className = "w-big";
      host.append(head, big);

      // 返回 update；数据每秒一次
      return {
        update(m) {
          big.textContent = m.metrics.cpu.usage + "%";
        },
        // 可选：页面重挂载时清理（退订等）
        destroy() {},
      };
    },
  });
})();
```

要点：
- `create(host)` 返回 `{ update(metricsTick), destroy?() }`
- 数据形状见 `src/lib/types.ts`（`MetricsTick`）；拿不到的数据用 C# 采集器补（见下）
- 卡片管理器（`E` → `C`）里会自动出现并带"插件"徽章，ON/OFF 随意
- 文件名即模块名，改完重启应用生效

## 二、C# 采集器（plugins/*.dll）

需要新数据源（ sensors 里没有的指标）时写一个采集器：

1. 建项目 `plugins-src/MyPlugin/MyPlugin.csproj`：

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0-windows10.0.19041.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <!-- 只借类型不复制宿主：Private="false" 必须 -->
    <ProjectReference Include="..\..\app\CrtMonitor.csproj" Private="false" />
  </ItemGroup>
</Project>
```

2. 实现 `ICollector`：

```csharp
using CrtMonitor;
using CrtMonitor.Collectors;

public sealed class MyCollector : ICollector
{
    public void Poll(TickDto tick)
    {
        // 直接往 DTO 塞字段；要新字段就扩展 app/Dtos.cs（协议版本化原则：新增可选）
        // 耗时操作放 Task.Run + 缓存（参考 WeatherCollector/MediaCollector 的 busy 模式）
    }
}
```

3. 构建：`dotnet build -c Release`，把 **只有插件自己的 dll** 拷进 `publish\plugins\`（不要用 `-o`，会把整个依赖图倒进去）
4. 重启应用即加载；失败不影响宿主（日志见 crt.log）

完整参考：`plugins-src/BatteryPlugin`（采集器）+ `plugins/battery.js`（卡片）。

## 三、数据协议

- 载荷 = `TickDto`（`app/Dtos.cs`），JSON camelCase，`version: 1`
- 新增字段：DTO 加属性 + 前端 `src/lib/types.ts` 加同名可选字段即可（向后兼容）
- 破坏性变更才递增 `version`
- 字段名以单元测试 `ProtocolSerializationTests` 为回归网（改协议先跑测试）

## 四、主题（顺带）

`themes/*.json`：`{"id","name","vars":{"--phos","--phos-bright","--phos-dim","--phos-faint","--bg","--glow","--radius","--font-mono"},"effects":{...可选}}`——`--font-mono` 可换字体，`effects` 让主题自带特效参数。
