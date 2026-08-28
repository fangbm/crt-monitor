import type { HistoryMsg, MetricsTick } from "./types";

export interface PageWidget {
  id: string;
  /** 百分比坐标/尺寸（0-100，相对页面画布） */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageInfo {
  name: string;
  /** 自由布局（新格式，保存时使用） */
  widgets?: PageWidget[];
  /** 用户主动隐藏的卡片 id：自动补全时跳过（区分"新卡片"与"被关闭的卡片"） */
  hidden?: string[] | null;
  /** 顺序布局（旧格式，读取时自动转换为 widgets） */
  layout?: string[];
}

export interface ShellTheme {
  id: string;
  name: string;
  vars: Record<string, string>;
  effects?: {
    scanline?: number;
    flicker?: boolean;
    vignette?: number;
    curvature?: boolean;
  } | null;
}

export interface ShellConfig {
  type: "config";
  theme: string;
  effects?: {
    scanline?: number;
    flicker?: boolean;
    vignette?: number;
    curvature?: boolean;
  } | null;
  /** 多页面定义；缺省时前端用默认页 */
  pages?: PageInfo[] | null;
  /** 旧版单页布局（未配置 pages 时使用） */
  layout?: string[] | null;
  autostart?: boolean;
  /** themes/*.json 扫描结果 */
  themes?: ShellTheme[] | null;
  /** plugins/*.js 文件名，前端经 https://plugins.local/ 动态加载 */
  plugins?: string[] | null;
  /** 防灼屏微抖模式：always（默认）/ idle / off */
  burnin?: string;
}

export interface AutostartNotice {
  type: "autostart";
  value: boolean;
}

export interface NoticeMsg {
  type: "notice";
  text: string;
}

interface WebViewMessageEvent {
  data: unknown;
}

interface ChromeWebView {
  addEventListener(type: "message", cb: (e: WebViewMessageEvent) => void): void;
  removeEventListener(type: "message", cb: (e: WebViewMessageEvent) => void): void;
  postMessage(msg: string): void;
}

declare global {
  interface Window {
    chrome?: { webview?: ChromeWebView };
  }
}

export interface Handlers {
  onTick(m: MetricsTick): void;
  onConfig(c: ShellConfig): void;
  onHistory?(h: HistoryMsg): void;
  onAutostart?(on: boolean): void;
  onNotice?(text: string): void;
}

/**
 * 订阅壳推送。消息分四类：config / autostart / history / metrics tick；
 * 纯浏览器（开发调试）时回退到本地模拟数据。
 */
export function connect(handlers: Handlers): () => void {
  const wv = window.chrome?.webview;
  if (wv) {
    const onMessage = (e: WebViewMessageEvent) => {
      const d = e.data as Partial<ShellConfig> & Partial<MetricsTick> & Partial<AutostartNotice> & Partial<HistoryMsg> & Partial<NoticeMsg>;
      if (d && d.type === "config") handlers.onConfig(d as ShellConfig);
      else if (d && d.type === "autostart") handlers.onAutostart?.((d as AutostartNotice).value);
      else if (d && d.type === "history") handlers.onHistory?.(d as HistoryMsg);
      else if (d && d.type === "notice") handlers.onNotice?.((d as NoticeMsg).text ?? "");
      else if (d && d.version === 1) handlers.onTick(d as MetricsTick);
    };
    wv.addEventListener("message", onMessage);
    return () => wv.removeEventListener("message", onMessage);
  }
  handlers.onConfig(mockConfig);
  startMockHistory(handlers.onHistory);
  return startMock(handlers.onTick);
}

/** 前端 → 壳命令：toggle-fullscreen / quit / reload / save-pages / toggle-autostart。浏览器里为空操作。 */
export function postCommand(cmd: string, value?: unknown): void {
  window.chrome?.webview?.postMessage(JSON.stringify({ cmd, value }));
}

export const mockConfig: ShellConfig = {
  type: "config",
  theme: "green",
  effects: { scanline: 0.35, flicker: true, vignette: 0.55, curvature: true },
  pages: [
    { name: "SYS", layout: ["cpu", "mem", "disk", "net", "proc", "sensors"] },
    { name: "LIFE", layout: ["clock", "weather", "battery"] },
    { name: "HIST", layout: ["hist24", "stats"] },
  ],
  autostart: false,
  themes: null,
  plugins: [],
};

/** 模拟 24h 历史（浏览器调试用），5 秒推一批。 */
function startMockHistory(cb?: (h: HistoryMsg) => void): void {
  if (!cb) return;
  const now = Math.floor(Date.now() / 60000) * 60;
  const points = Array.from({ length: 240 }, (_, i) => {
    const t = now - (240 - i) * 60;
    const cpu = 20 + 25 * Math.sin(i / 18) + Math.random() * 10;
    return {
      t,
      cpu: +cpu.toFixed(1),
      cpu_max: +(cpu + 12 + Math.random() * 8).toFixed(1),
      mem: +(55 + 8 * Math.sin(i / 40) + Math.random() * 3).toFixed(1),
      rx: +(1_500_000 * (0.3 + Math.random())).toFixed(0),
      tx: +(300_000 * (0.3 + Math.random())).toFixed(0),
    };
  });
  cb({
    type: "history",
    points,
    stats: {
      cpu_max: 92,
      cpu_avg: 31,
      mem_max: 71,
      rx_max: 2_400_000,
      tx_max: 500_000,
      today_rx: 2_800_000_000,
      today_tx: 460_000_000,
    },
  });
}

/** 模拟数据源：浏览器里直接 npm run dev 调 UI 用。 */
function startMock(cb: (m: MetricsTick) => void): () => void {
  const cores = 12;
  let cpu = 20;
  let rx = 2_000_000;
  let tx = 400_000;
  const timer = setInterval(() => {
    cpu = clamp(cpu + (Math.random() - 0.5) * 25, 3, 97);
    rx = Math.max(0, rx + (Math.random() - 0.5) * 1_500_000);
    tx = Math.max(0, tx + (Math.random() - 0.5) * 300_000);
    cb({
      version: 1,
      ts: Date.now(),
      uptime: 3600 * 27 + 1234,
      host: {
        name: "MOCK-HOST",
        os: "Windows 11 (mock)",
        cpu_model: "Mock Core i7-12700 @ 4.90GHz",
        core_count: cores,
      },
      metrics: {
        cpu: {
          usage: cpu,
          cores: Array.from({ length: cores }, () => clamp(cpu + (Math.random() - 0.5) * 60, 0, 100)),
          freq_mhz: 4900,
        },
        mem: {
          total_b: 34359738368,
          used_b: 19327352832,
          swap_total_b: 42949672960,
          swap_used_b: 2147483648,
        },
        disks: [
          { name: "Windows", mount: "C:", total_b: 1_000_204_886_016, available_b: 300_000_000_000, read_bps: 51_200_000, write_bps: 12_800_000 },
          { name: "Data", mount: "D:", total_b: 4_000_768_610_304, available_b: 2_100_000_000_000, read_bps: 1_024_000, write_bps: 204_800 },
        ],
        net: { rx_bps: rx, tx_bps: tx },
        proc: [
          { name: "chrome x4", cpu: 8.4, mem_b: 2_100_000_000 },
          { name: "Code x2", cpu: 5.1, mem_b: 1_400_000_000 },
          { name: "dotnet", cpu: 2.2, mem_b: 180_000_000 },
          { name: "explorer", cpu: 0.8, mem_b: 120_000_000 },
          { name: "spoolsv", cpu: 0.1, mem_b: 20_000_000 },
        ],
        sensors: { cpu_temp: 62, gpu_temp: 58, gpu_load: 34, gpu_name: "NVIDIA GeForce RTX 4070" },
        weather: { temp_c: 28.4, humidity: 63, wind_kmh: 12, code: 2, text: "多云", place: "Shenzhen", forecast: [
          { code: 1, min_c: 26, max_c: 33 },
          { code: 3, min_c: 25, max_c: 31 },
          { code: 61, min_c: 24, max_c: 30 },
        ] },
        battery: { present: true, charge_pct: 76, ac_power: true },
        alerts: [],
      },
    });
  }, 1000);
  return () => clearInterval(timer);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
