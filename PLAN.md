# CRT-Monitor — 复古副屏电脑监控软件 · 项目规划

> 目标：在 CRT 复古风格的副屏上展示电脑实时状态，MVP 聚焦性能监控，架构上为后续功能（网络、进程、天气、系统信息等）预留扩展能力。

## 1. 产品定位

- **展示端**：Windows 副屏，全屏运行，复古 CRT 终端风格（磷光绿/琥珀色、扫描线、辉光、轻微闪烁与曲面暗角）。
- **用途**：桌面常驻的"仪表盘"，观赏性 + 实用性并重。
- **核心体验**：低占用、常开不崩、风格统一、模块可插拔。

## 2. 技术选型

| 层 | 方案 | 理由 |
|---|---|---|
| 壳 | **C# WinForms + WebView2**（.NET 8） | 无需管理员权限即可安装工具链和编译；WebView2 运行时 Windows 自带；内存占用低（壳 ~20MB） |
| 前端 | **Vite + TypeScript + 原生 Canvas/SVG** | 波形图、示波器效果用 Canvas 画最流畅；无框架依赖，构建产物 < 10KB |
| 数据采集 | C# P/Invoke：`NtQuerySystemInformation`（每核 CPU）、`CallNtPowerInformation`（实时频率）、`GlobalMemoryStatusEx`（内存/交换）、BCL `NetworkInterface`（网速）、`DriveInfo`（磁盘） | 刻意避开性能计数器/WMI（分类名随系统语言本地化，且 WMI 查询慢）；全部采集 < 1ms |
| 通信 | WebView2 `PostWebMessageAsJson` 每秒推送协议 JSON | 前端只渲染，不做轮询逻辑 |

> **选型修订（2026-08-23）**：原计划 Tauri 2（Rust）。实施时发现本机无 Node/Rust/MSVC 工具链且 shell 无管理员权限（UAC 无法确认），MSVC Build Tools 无法安装导致 Tauri 不可行。评估后切换为 C# WinForms + WebView2 方案：dotnet SDK 支持纯用户目录安装、自带完整编译链，采集能力反而更强（实时 CPU 频率、无本地化问题）。前端代码与数据协议不受影响。

## 3. 架构设计（面向扩展）

```
┌─────────────── 前端（WebView2，全屏） ───────────────┐
│  Theme（CRT 皮肤引擎：颜色/扫描线/辉光参数化）        │
│  Layout（网格布局，每格一个 Widget）                  │
│  Widgets（可插拔组件，注册制）                        │
│   ├─ CpuGraph   ├─ MemBar   ├─ DiskList             │
│   ├─ NetGraph   ├─ (未来: TempGauge / Gpu / 天气)   │
└─────────────── ▲ PostWebMessageAsJson ─────────────┘
                │ {version:1, ts, host, metrics:{...}}
┌─────────────── C# 壳（WinForms, .NET 8） ────────────┐
│  Scheduler（WinForms Timer 统一 tick，默认 1s）       │
│  Collectors（采集器，每个指标域一个，注册制）          │
│   ├─ CpuMemCollector（P/Invoke）                     │
│   ├─ DiskCollector   ├─ NetCollector                │
│   ├─ (未来: GpuCollector / WeatherCollector)         │
│  ConfigStore（config.json：刷新率/主题/dev url）      │
│  WebView2 壳（无边框全屏，自动选副屏，阻止息屏）       │
└─────────────────────────────────────────────────────┘
```

**扩展机制（关键设计）**：
1. **后端 Collector 注册制**：新指标 = 新增一个实现 `ICollector` 的类并加进 `Scheduler` 的列表，填充协议 DTO 中自己负责的字段。
2. **前端 Widget 注册制**：`registerWidget(id, span, create)`，新功能 = 新组件模块 + main.ts 一行 import。
3. **数据协议版本化**：`{ version, ts, host, metrics: { cpu, mem, disks, net } }`（DTO 字段与 `src/lib/types.ts` 一一对应），前后端解耦。
4. **主题可配置**：磷光绿 / 琥珀 / 白色（IBM 风格）已实现，扫描线强度、闪烁、弯曲待做成参数。

## 4. MVP 范围（性能监控）

### 4.1 指标
- CPU：总占用率 + 每核占用、频率、型号（静态）
- 内存：已用/总量、占用率、交换分区
- 磁盘：各盘容量、读/写速率
- 网络：上/下行速率（实时 + 峰值）
- GPU/温度：尽力而为（Windows 下温度需 WMI/LibreHardwareMonitor，不稳定则留到 v2）

### 4.2 UI（一屏 dashboard）
- 顶部：ASCII 风 logo + 主机名 + 运行时间 + 时钟
- CPU 多核波形（示波器风格滚动曲线）+ 大号占用率数字
- 内存/交换 分段条形图
- 磁盘列表（容量条 + 读写速率）
- 网络上下行双曲线 + 实时速率读数
- CRT 特效层：扫描线 overlay、辉光（CSS filter / canvas shadowBlur）、开机自检动画（BIOS 风格启动画面，加分项）

### 4.3 功能性需求
- 全屏无边框启动，记住窗口位置（副屏）
- 刷新率可配（默认 1s，CPU 曲线可到 500ms）
- 开机自启（可选）
- 目标常驻占用：< 50MB 内存、CPU < 1%

### 4.4 明确不做（MVP）
- GPU 深度监控、进程管理、远程访问、告警通知、历史数据存储

## 5. 版本路线

| 版本 | 内容 |
|---|---|
| **v0.1（MVP）** ✅ | WebView2 骨架 + P/Invoke 采集 + CPU/内存/磁盘/网络 dashboard + CRT 主题基础特效 |
| **v0.2** ✅ | 主题系统（绿/琥珀/白 + 热键切换）、特效参数化（扫描线/闪烁/暗角/弯曲）、开机自检动画、布局顺序配置、窄副屏 2 列自适应、F11/Esc 窗口控制、磁盘读写速率（WMI） |
| **v0.3** ✅（部分） | 进程 Top 榜（CPU/内存，同名合并，v0.4 项提前）、拖拽布局编辑（E 键）+ config.json 自动持久化、面板行高下限。温度/GPU 集成完成（LibreHardwareMonitor 0.9.6），运行需管理员提权，未提权时优雅降级；真实桶形畸变经评估不可行（Chromium 无法对整个 DOM 做 displacement 滤镜），以圆角+压边+暗角模拟替代 |
| **v0.4** ✅ | 多页面（Tab 循环切换 + 页面指示器 + 按页独立布局/拖拽持久化）、LIFE 页时钟/天气模块（Open-Meteo 免 key + ip 定位，壳侧 HTTP 规避 CORS） |
| **v1.0** ✅ | 用户级安装（`scripts/build-release.cmd` 自包含发布 ~175MB 免运行时依赖 + `install.cmd`/`uninstall.cmd` 写 HKCU Run 与开始菜单快捷方式）、`A` 键运行中切换自启（三态语义：config 缺省不碰注册表） |
| **v0.5 扩展包** ✅ | 主题目录化（`themes/*.json` 扫描 + `T` 键循环切换 + set-theme 持久化）、插件机制（C# `ICollector` DLL 反射加载 + 前端 `plugins/*.js` 经 `plugins.local` 虚拟域动态 import，示例 Battery 插件端到端）、告警（阈值规则 + 持续时间 + 冷却 + 可选蜂鸣，CRT 红色闪烁横幅）、历史数据（分钟级聚合 24h 环形 + history.json 持久化 + HIST 页 hist24 曲线/stats 面板，低频推送不占 tick） |
| **v0.6 自由布局** ✅ | 页面协议升级为百分比坐标（`widgets:[{id,x,y,w,h}]`，旧 `layout` 数组自动转换）；编辑模式拖拽移动 + 任意边/角调整宽高（纯坐标 ±16px 命中，Pointer Events），吸附 2% 网格，松手即持久化；画布绝对定位 + 百分比尺寸，窗口任意缩放按比例自适应 |
| **v0.7 卡片管理器** ✅ | 编辑模式下 `＋CARDS` 按钮 / `C` 键打开：勾选当前页展示哪些卡片（▣/▢），新卡片自动扫描空位放置，插件卡片标记"插件"徽章；`window.CRT.registerWidget` 注册的卡片自动打插件标记 |
| **v0.8 体验包** ✅ | 托盘图标（CPU% 数字动态重绘、左键显隐、右键导出/导入配置/退出；Esc 隐藏到托盘）、告警中心（alerts.json 持久化 + 气泡通知 + alertlog 卡片）、CPU 每核热力图卡片、磁盘 R/W 指示灯卡片、3 日天气预报（Open-Meteo daily）、今日上/下行流量累计（tick 积分，随 history.json 持久化）、S 键截图到 图片\CRT-Monitor\、屏保（5 分钟无操作切暗色大时钟防灼屏）、开机问候语。修复：页面 reload 后 config 不重发导致主题目录/布局回退（"modern 切不出来"的根因）、wwwroot 旧 bundle 堆积、快捷键双触发 |

## 6. 目录结构（实际）

```
crt/
├─ src/                    # 前端（Vite + TS）
│  ├─ widgets/             # 可插拔组件（每个指标一个）
│  ├─ lib/                 # 数据协议类型、transport、示波器 Chart、主题
│  └─ main.ts / style.css
├─ app/                    # C# 壳（.NET 8 WinForms）
│  ├─ Collectors/          # ICollector + 各实现（P/Invoke 集中在 NativeMethods.cs）
│  ├─ MainForm.cs          # WebView2 无边框全屏窗口
│  ├─ Scheduler.cs         # 统一 tick → JSON
│  └─ Dtos.cs / Config.cs  # 协议 DTO / config.json
├─ dist/                   # 前端构建产物（构建时拷入 app 输出 wwwroot/）
├─ docs/preview.png        # 实际运行截图
├─ PLAN.md
└─ README.md
```

## 7. 风险与对策

- **温度/GPU 采集在 Windows 不稳定** → MVP 不承诺，v0.3 用 LibreHardwareMonitor 库（需要管理员权限，提前说明）。
- **CRT 特效导致渲染开销大** → 扫描线用静态 CSS overlay 而非逐帧绘制；曲线绘制限帧。
- **副屏休眠/息屏** → 提供 `powercfg` 说明或应用内设置阻止关闭显示器。

## 8. 下一步

1. 初始化 Tauri + Vite 项目骨架
2. 打通 sysinfo → 前端 的 1s 数据推送链路
3. 先做 CPU 单个 widget + CRT 主题雏形，验证视觉方向后再铺开
