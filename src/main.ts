import { connect, postCommand, type PageWidget, type PageInfo, type ShellConfig } from "./lib/transport";
import "./style.css";
import { applyTheme, setDefaultEffects, setThemeCatalog, themeIds, themeList } from "./lib/theme";
import type { MetricsTick } from "./lib/types";
import { setHistory } from "./lib/historyStore";
import { registeredWidgets, el, type Widget, type WidgetDef } from "./widgets/registry";
import "./widgets/cpu";
import "./widgets/mem";
import "./widgets/disk";
import "./widgets/net";
import "./widgets/proc";
import "./widgets/sensors";
import "./widgets/clock";
import "./widgets/weather";
import "./widgets/hist24";
import "./widgets/stats";
import "./widgets/heatmap";
import "./widgets/leds";
import "./widgets/weather3";
import "./widgets/alertlog";

const LOGO = String.raw`  ____ ____  ____    ____
 / ___/ ___||  _ \  |  _ \ ___  __ _ _   _  ___
| |   \___ \| |_) | | |_) / _ \/ _` + "`" + String.raw` | | | |/ _ \
| |___ ___) |  _ <  |  _ <  __/ (_| | |_| |  __/
 \____|____/|_| \_\ |_| \_\___|\__, |\__,_|\___/
                                |_|  MONITOR v0.8`;

const BOOT_LINES = [
  "CRT-MONITOR BIOS v0.8  (c) 2026",
  "MEMORY TEST ................ OK",
  "PHOSPHOR CALIBRATION ....... OK",
  "SCANLINE GENERATOR ......... OK",
  "MOUNTING SENSORS ...........",
  "  CPU  ....... DETECTED",
  "  MEMORY ..... DETECTED",
  "  DISKS ...... DETECTED",
  "  NETWORK .... DETECTED",
  "  PROCESSES .. DETECTED",
  "  WEATHER .... LINKING",
  "  HISTORY .... INDEXING",
  "ALL SYSTEMS NOMINAL.",
];

/** 固定日期节日问候（农历节日无法离线计算，只做公历）。 */
function greetingLine(): string {
  const d = new Date();
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const map: Record<string, string> = {
    "1/1": "HAPPY NEW YEAR",
    "2/14": "VALENTINE'S DAY",
    "5/1": "LABOR DAY",
    "6/1": "CHILDREN'S DAY",
    "10/1": "NATIONAL DAY",
    "10/31": "HALLOWEEN",
    "12/24": "XMAS EVE",
    "12/25": "MERRY CHRISTMAS",
    "12/31": "NEW YEAR'S EVE",
  };
  const hour = d.getHours();
  const daypart = hour < 6 ? "GOOD NIGHT" : hour < 12 ? "GOOD MORNING" : hour < 18 ? "GOOD AFTERNOON" : "GOOD EVENING";
  return `${map[md] ?? daypart}, ${d.getFullYear()}`;
}

/** 默认自由布局（百分比坐标）：SYS / LIFE / HIST */
const DEFAULT_PAGES: PageInfo[] = [
  {
    name: "SYS",
    widgets: [
      { id: "cpu", x: 0, y: 0, w: 46, h: 52 },
      { id: "heatmap", x: 46, y: 0, w: 26, h: 52 },
      { id: "mem", x: 72, y: 0, w: 28, h: 25 },
      { id: "disk", x: 72, y: 25, w: 28, h: 27 },
      { id: "net", x: 0, y: 52, w: 34, h: 48 },
      { id: "proc", x: 34, y: 52, w: 34, h: 48 },
      { id: "sensors", x: 68, y: 52, w: 16, h: 48 },
      { id: "leds", x: 84, y: 52, w: 16, h: 24 },
      { id: "alertlog", x: 84, y: 76, w: 16, h: 24 },
    ],
  },
  {
    name: "LIFE",
    widgets: [
      { id: "clock", x: 0, y: 0, w: 60, h: 68 },
      { id: "weather", x: 60, y: 0, w: 40, h: 44 },
      { id: "weather3", x: 60, y: 44, w: 40, h: 24 },
      { id: "battery", x: 0, y: 68, w: 100, h: 32 },
    ],
  },
  {
    name: "HIST",
    widgets: [
      { id: "hist24", x: 0, y: 0, w: 100, h: 62 },
      { id: "stats", x: 0, y: 62, w: 100, h: 38 },
    ],
  },
];

/** 吸附步长与尺寸下限（百分比） */
const SNAP = 2;
const MIN_W = 8;
const MIN_H = 10;

interface MountedCell {
  el: HTMLElement;
  def: WidgetDef;
  pos: PageWidget;
}

let pages: PageInfo[] = DEFAULT_PAGES;
let currentPage = 0;
const mounted: MountedCell[] = [];
let widgets: Widget[] = [];
let latestTick: MetricsTick | null = null;
let currentTheme = "green";
let pluginsReady: Promise<void> = Promise.resolve();

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `UP ${d}d ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function boot(): Promise<void> {
  const bootEl = document.getElementById("boot")!;
  if (new URLSearchParams(location.search).has("noboot")) {
    bootEl.remove();
    return;
  }
  const log = document.getElementById("boot-log")!;
  const lines = [...BOOT_LINES];
  lines.splice(lines.length - 1, 0, greetingLine());
  for (const line of lines) {
    log.textContent += line + "\n";
    await new Promise((r) => setTimeout(r, 90));
  }
  bootEl.classList.add("fade");
  await new Promise((r) => setTimeout(r, 400));
  bootEl.remove();
}

/** 旧格式 layout:string[] 自动转 widgets（两列流式），新格式原样。 */
function normalizePage(page: PageInfo): PageWidget[] {
  if (page.widgets && page.widgets.length > 0) return page.widgets;
  const ids = page.layout ?? [];
  if (ids.length === 0) return [];
  const rows = Math.ceil(ids.length / 2);
  return ids.map((id, i) => ({
    id,
    x: (i % 2) * 50,
    y: Math.floor(i / 2) * (100 / rows),
    w: 50,
    h: 100 / rows,
  }));
}

/** 页面里没提到的已注册 widget 自动补到页面底部；用户主动隐藏的（page.hidden）跳过。 */
function completeWidgets(page: PageInfo): PageWidget[] {
  const list = normalizePage(page);
  const hidden = new Set(page.hidden ?? []);
  const known = new Set(list.map((w) => w.id));
  let y = Math.max(0, ...list.map((w) => w.y + w.h));
  const missing = registeredWidgets().filter((d) => !known.has(d.id) && !hidden.has(d.id));
  return [
    ...list.filter((w) => registeredWidgets().some((d) => d.id === w.id)),
    ...missing.map((d) => ({ id: d.id, x: 0, y: Math.min(100, y), w: 100, h: Math.max(20, 100 - y) })),
  ];
}

/** 找一块 30×20 的空位放新卡片（按 2% 步进扫描），找不到就追加到底部。 */
function findFreeSlot(): Pick<PageWidget, "x" | "y" | "w" | "h"> {
  const ws = normalizePage(pages[currentPage]);
  const overlaps = (x: number, y: number, w: number, h: number) =>
    ws.some(v => x < v.x + v.w && x + w > v.x && y < v.y + v.h && y + h > v.y);
  const W = 30;
  const H = 20;
  for (let y = 0; y <= 100 - H; y += SNAP) {
    for (let x = 0; x <= 100 - W; x += SNAP) {
      if (!overlaps(x + 1, y + 1, W - 2, H - 2)) return { x, y, w: W, h: H };
    }
  }
  const bottom = Math.max(0, ...ws.map(v => v.y + v.h));
  return { x: 0, y: Math.min(100 - MIN_H, bottom), w: 100, h: Math.max(MIN_H, 100 - bottom) };
}

function setPos(cell: HTMLElement, p: PageWidget): void {
  cell.style.left = `${p.x}%`;
  cell.style.top = `${p.y}%`;
  cell.style.width = `${p.w}%`;
  cell.style.height = `${p.h}%`;
}

function updatePageIndicator(): void {
  const el = document.getElementById("hd-page");
  if (el) el.textContent = `${pages[currentPage].name}  ${currentPage + 1}/${pages.length}`;
}

function mountPage(idx: number): void {
  const grid = document.getElementById("grid")!;
  for (const w of widgets) w.destroy?.();
  grid.textContent = "";
  grid.style.cursor = "";
  mounted.length = 0;
  widgets = [];
  for (const pos of completeWidgets(pages[idx])) {
    const def = registeredWidgets().find((d) => d.id === pos.id);
    if (!def) continue;
    const cell = el("section", "widget");
    setPos(cell, pos);
    mounted.push({ el: cell, def, pos });
    widgets.push(def.create(cell));
    grid.append(cell);
  }
  updatePageIndicator();
  if (latestTick) renderTick(latestTick);
}

function switchPage(delta: number): void {
  if (pages.length < 2) return;
  currentPage = (currentPage + delta + pages.length) % pages.length;
  setEditMode(false);
  mountPage(currentPage);
}

/** 布局编辑结束：把当前页坐标发回壳持久化（剥离旧版 layout 字段避免双写）。 */
function commitLayout(): void {
  const { layout: _legacy, ...page } = pages[currentPage];
  pages[currentPage] = { ...page, widgets: mounted.map((m) => ({ ...m.pos })) };
  postCommand("save-pages", pages);
}

const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

type DragMode = "move" | "l" | "r" | "t" | "b" | "lt" | "rt" | "lb" | "rb";

interface DragState {
  mode: DragMode;
  cell: MountedCell;
  orig: PageWidget;
  startX: number;
  startY: number;
  gridW: number;
  gridH: number;
}

interface ZoneHit {
  cell: MountedCell;
  mode: DragMode;
  edgeDist: number;
}

/** 纯坐标命中：任意面板的任意边/角（±thr），不依赖 DOM。
 * 边的命中区限制在边线段范围内（另一轴 ±thr 容差），不会沿画布延伸。
 * 边/角命中优先于面板内部（move）；同为边取距离最近者；同为 move 取视觉最上层。 */
function pickZone(px: number, py: number, thrX: number, thrY: number): ZoneHit | null {
  let best: ZoneHit | null = null;
  for (const m of mounted) {
    const p = m.pos;
    const inX = px >= p.x - thrX && px <= p.x + p.w + thrX;
    const inY = py >= p.y - thrY && py <= p.y + p.h + thrY;
    const nearL = inY && Math.abs(px - p.x) <= thrX;
    const nearR = inY && Math.abs(px - (p.x + p.w)) <= thrX;
    const nearT = inX && Math.abs(py - p.y) <= thrY;
    const nearB = inX && Math.abs(py - (p.y + p.h)) <= thrY;
    const inside = px > p.x && px < p.x + p.w && py > p.y && py < p.y + p.h;

    let mode: DragMode;
    if ((nearL || nearR) && (nearT || nearB)) {
      mode = ((nearL ? "l" : "r") + (nearT ? "t" : "b")) as DragMode;
    } else if (nearL) mode = "l";
    else if (nearR) mode = "r";
    else if (nearT) mode = "t";
    else if (nearB) mode = "b";
    else if (inside) mode = "move";
    else continue;

    const edgeDist = Math.min(
      nearL ? Math.abs(px - p.x) : Infinity,
      nearR ? Math.abs(px - (p.x + p.w)) : Infinity,
      nearT ? Math.abs(py - p.y) : Infinity,
      nearB ? Math.abs(py - (p.y + p.h)) : Infinity,
    );
    const hit: ZoneHit = { cell: m, mode, edgeDist };
    if (!best) {
      best = hit;
      continue;
    }
    const hitIsEdge = hit.mode !== "move";
    const bestIsEdge = best.mode !== "move";
    if (hitIsEdge && !bestIsEdge) best = hit;
    else if (hitIsEdge && bestIsEdge && hit.edgeDist < best.edgeDist) best = hit;
    else if (!hitIsEdge && !bestIsEdge) best = hit; // 后挂载的在上层
  }
  return best;
}

const ZONE_CURSOR: Record<DragMode, string> = {
  move: "move",
  l: "ew-resize",
  r: "ew-resize",
  t: "ns-resize",
  b: "ns-resize",
  lt: "nwse-resize",
  rb: "nwse-resize",
  rt: "nesw-resize",
  lb: "nesw-resize",
};

/** 编辑态交互：面板内部拖拽移动；任意边（左/右/上/下）与四角可抓取调整宽高。
 * 全部按指针坐标判定（±16px 命中区），窗口缩放期间百分比自动适应。 */
function bindEditInteractions(grid: HTMLElement): void {
  let drag: DragState | null = null;

  const toPct = (e: PointerEvent) => {
    const r = grid.getBoundingClientRect();
    return {
      px: ((e.clientX - r.left) / r.width) * 100,
      py: ((e.clientY - r.top) / r.height) * 100,
      thrX: (16 / r.width) * 100,
      thrY: (16 / r.height) * 100,
      w: r.width,
      h: r.height,
    };
  };

  grid.addEventListener("pointerdown", (e) => {
    if (!document.body.classList.contains("edit")) return;
    e.preventDefault();
    const { px, py, thrX, thrY, w, h } = toPct(e);
    const zone = pickZone(px, py, thrX, thrY);
    if (!zone) return;
    drag = {
      mode: zone.mode,
      cell: zone.cell,
      orig: { ...zone.cell.pos },
      startX: e.clientX,
      startY: e.clientY,
      gridW: w,
      gridH: h,
    };
    zone.cell.el.classList.add("dragging");
    grid.setPointerCapture(e.pointerId);
  });

  grid.addEventListener("pointermove", (e) => {
    if (!drag) {
      if (document.body.classList.contains("edit")) {
        const { px, py, thrX, thrY } = toPct(e);
        const zone = pickZone(px, py, thrX, thrY);
        grid.style.cursor = zone ? ZONE_CURSOR[zone.mode] : "";
      }
      return;
    }

    const dx = ((e.clientX - drag.startX) / drag.gridW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.gridH) * 100;
    const o = drag.orig;
    const p: PageWidget = { ...o };

    if (drag.mode === "move") {
      p.x = o.x + dx;
      p.y = o.y + dy;
    } else {
      if (drag.mode.includes("l")) {
        p.x = clamp(o.x + dx, 0, o.x + o.w - MIN_W);
        p.w = o.x + o.w - p.x;
      }
      if (drag.mode.includes("r")) {
        p.w = clamp(o.w + dx, MIN_W, 100 - o.x);
      }
      if (drag.mode.includes("t")) {
        p.y = clamp(o.y + dy, 0, o.y + o.h - MIN_H);
        p.h = o.y + o.h - p.y;
      }
      if (drag.mode.includes("b")) {
        p.h = clamp(o.h + dy, MIN_H, 100 - o.y);
      }
    }
    drag.cell.pos = p;
    setPos(drag.cell.el, p);
  });

  const finish = () => {
    if (!drag) return;
    const m = drag.cell;
    const p = m.pos;
    if (drag.mode === "move") {
      m.pos = {
        id: p.id,
        x: clamp(snap(p.x), 0, 100 - MIN_W),
        y: clamp(snap(p.y), 0, 100 - MIN_H),
        w: Math.max(MIN_W, snap(p.w)),
        h: Math.max(MIN_H, snap(p.h)),
      };
    } else {
      // 只吸附"被拖动的那条边"，另一侧保持不动
      let { x, y, w, h } = p;
      if (drag.mode.includes("l")) {
        x = clamp(snap(x), 0, x + w - MIN_W);
        w = p.x + p.w - x;
      }
      if (drag.mode.includes("r")) {
        const edge = clamp(snap(x + w), x + MIN_W, 100);
        w = edge - x;
      }
      if (drag.mode.includes("t")) {
        y = clamp(snap(y), 0, y + h - MIN_H);
        h = p.y + p.h - y;
      }
      if (drag.mode.includes("b")) {
        const edge = clamp(snap(y + h), y + MIN_H, 100);
        h = edge - y;
      }
      m.pos = { id: p.id, x, y, w, h };
    }
    setPos(m.el, m.pos);
    m.el.classList.remove("dragging");
    drag = null;
    commitLayout();
  };
  grid.addEventListener("pointerup", finish);
  grid.addEventListener("pointercancel", finish);
}

function flashHint(text: string): void {
  const hint = document.getElementById("hint");
  if (!hint) return;
  hint.textContent = text;
  setTimeout(() => {
    if (!document.body.classList.contains("edit")) hint.textContent = "";
  }, 2000);
}

/* ---------- 卡片管理器：选择当前页展示哪些卡片（含插件卡片） ---------- */

function isOnCurrentPage(id: string): boolean {
  return normalizePage(pages[currentPage]).some(w => w.id === id);
}

function toggleCard(id: string, show: boolean): void {
  const { layout: _legacy, ...page } = pages[currentPage];
  const widgets = normalizePage(page);
  const hidden = new Set(page.hidden ?? []);
  let next = widgets;

  if (show) {
    hidden.delete(id);
    if (!widgets.some(w => w.id === id)) {
      next = [...widgets, { id, ...findFreeSlot() }];
    }
  } else {
    hidden.add(id);
    next = widgets.filter(w => w.id !== id);
  }

  pages[currentPage] = { ...page, widgets: next, hidden: [...hidden] };
  mountPage(currentPage);
  commitLayout();
  renderCardManager();
}

function renderCardManager(): void {
  const panel = document.getElementById("card-manager")!;
  if (panel.hidden) return;
  const pageName = pages[currentPage].name;
  panel.textContent = "";

  const head = el("div", "cm-head");
  head.append(el("span", "", `CARDS · ${pageName}`));
  const close = el("button", "cm-close", "×");
  close.addEventListener("click", () => (panel.hidden = true));
  head.append(close);

  const list = el("div", "cm-list");
  for (const def of registeredWidgets()) {
    const on = isOnCurrentPage(def.id);
    const row = el("div", `cm-row${on ? " on" : " off"}`);
    const mark = el("span", "cm-mark", on ? "▣" : "▢");
    const label = el("span", "cm-label", def.title || def.id);
    const badge = el("span", `cm-badge${def.plugin ? " plugin" : ""}`, def.plugin ? "插件" : "内置");
    const state = el("span", "cm-state", on ? "ON" : "OFF");
    row.append(mark, label, badge, state);
    row.addEventListener("click", () => toggleCard(def.id, !isOnCurrentPage(def.id)));
    list.append(row);
  }

  // 主题区：直接点名切换，不用数 T 循环
  const themeSec = el("div", "cm-sec", "THEMES");
  list.append(themeSec);
  for (const t of themeList()) {
    const active = t.id === currentTheme;
    const row = el("div", `cm-row cm-theme${active ? " on" : " off"}`);
    const mark = el("span", "cm-mark", active ? "▶" : "·");
    const label = el("span", "cm-label", t.name);
    row.append(mark, label);
    row.addEventListener("click", () => switchTheme(t.id));
    list.append(row);
  }

  const foot = el("div", "cm-foot", "插件：exe 目录 plugins/*.dll(js) 自动加载");
  panel.append(head, list, foot);
}

function openCardManager(): void {
  const panel = document.getElementById("card-manager")!;
  panel.hidden = false;
  renderCardManager();
}

function setEditMode(on: boolean): void {
  document.body.classList.toggle("edit", on);
  const grid = document.getElementById("grid");
  if (!on && grid) grid.style.cursor = "";
  const btn = document.getElementById("btn-cards")!;
  const manager = document.getElementById("card-manager")!;
  btn.hidden = !on;
  if (!on) manager.hidden = true;
  const hint = document.getElementById("hint");
  if (hint) hint.textContent = on ? "EDIT — 拖拽移动 · 任意边/角调整 · C 卡片管理 · E 退出" : "";
}

function applyEffects(cfg: ShellConfig): void {
  setDefaultEffects(cfg.effects ?? undefined);
}

/** plugins/*.js 经 plugins.local 虚拟域动态 import；模块内部用 window.CRT.registerWidget 注册。 */
function loadPlugins(names: string[]): Promise<void> {
  if (!names.length || !window.chrome?.webview) return Promise.resolve();
  return Promise.all(
    names.map(async (n) => {
      try {
        await import(/* @vite-ignore */ `https://plugins.local/${n}`);
      } catch (err) {
        console.warn(`plugin load failed: ${n}`, err);
      }
    }),
  ).then(() => undefined);
}

function applyConfig(c: ShellConfig): void {
  if (c.themes) setThemeCatalog(c.themes);
  currentTheme = c.theme;
  applyTheme(c.theme);
  applyEffects(c);
  if (c.pages && c.pages.length > 0) {
    pages = c.pages;
  } else if (c.layout && c.layout.length > 0) {
    pages = [{ name: "MAIN", layout: c.layout }];
  }
  currentPage = Math.min(currentPage, pages.length - 1);
  if (c.plugins && c.plugins.length > 0) {
    pluginsReady = loadPlugins(c.plugins);
  }
}

function renderAlerts(m: MetricsTick): void {
  const banner = document.getElementById("alert-banner")!;
  const alerts = m.metrics.alerts ?? [];
  banner.hidden = alerts.length === 0;
  if (alerts.length > 0) banner.textContent = `⚠ ${alerts.join("   ⚠ ")}`;
}

function renderTick(m: MetricsTick): void {
  if (!document.getElementById("hd-host")!.textContent) {
    document.getElementById("hd-logo")!.textContent = LOGO;
    document.getElementById("hd-host")!.textContent = `${m.host.name} · ${m.host.os}`;
    document.getElementById("hd-cpu")!.textContent = m.host.cpu_model;
  }
  document.getElementById("hd-clock")!.textContent =
    new Date(m.ts).toLocaleTimeString("zh-CN", { hour12: false });
  document.getElementById("hd-uptime")!.textContent = fmtUptime(m.uptime);
  renderAlerts(m);
  for (const w of widgets) w.update(m);
}

/** 统一的主题切换入口：更新状态 + 应用 + 持久化 + 提示 + 刷新管理器高亮 */
function switchTheme(id: string): void {
  currentTheme = id;
  applyTheme(id);
  postCommand("set-theme", id);
  flashHint(`THEME: ${id.toUpperCase()}`);
  renderCardManager();
}

function cycleTheme(): void {
  const ids = themeIds();
  const next = ids[(ids.indexOf(currentTheme) + 1) % Math.max(1, ids.length)] ?? ids[0];
  switchTheme(next);
}

/** 快捷键统一入口：页面 keydown 与壳转发（window.__hotkey）共用。
 * 80ms 去抖：壳转发与页面监听可能对同一按键各触发一次，按键重复也走这里。 */
let __lastCode = "";
let __lastAt = 0;
(globalThis as Record<string, unknown>).__hotkey = (code: string, key?: string): void => {
  const now = performance.now();
  if (code === __lastCode && now - __lastAt < 80) return;
  __lastCode = code;
  __lastAt = now;

  if (key === "F11") {
    postCommand("toggle-fullscreen");
  } else if (key === "Escape") {
    postCommand("quit");
  } else if (key === "Tab") {
    switchPage((globalThis as Record<string, unknown>).__shiftTab ? -1 : 1);
  } else if (code === "KeyR") {
    postCommand("reload");
  } else if (code === "KeyE") {
    setEditMode(!document.body.classList.contains("edit"));
  } else if (code === "KeyC") {
    if (document.body.classList.contains("edit")) {
      const panel = document.getElementById("card-manager")!;
      if (panel.hidden) openCardManager();
      else panel.hidden = true;
    }
  } else if (code === "KeyS") {
    postCommand("screenshot");
  } else if (code === "KeyA") {
    postCommand("toggle-autostart");
  } else if (code === "KeyT") {
    cycleTheme();
  } else if (code === "Digit1") switchTheme("green");
  else if (code === "Digit2") switchTheme("amber");
  else if (code === "Digit3") switchTheme("white");
};

function bindHotkeys(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key === "F11" || e.key === "Tab") e.preventDefault();
    (globalThis as Record<string, unknown>).__shiftTab = e.shiftKey;
    ((globalThis as Record<string, unknown>).__hotkey as (c: string, k?: string) => void)(e.code, e.key);
  });
}

/* ---------- 屏保：5 分钟无操作切暗色大时钟，任意输入退出 ---------- */

const IDLE_MS = 5 * 60 * 1000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function showScreensaver(on: boolean): void {
  const ss = document.getElementById("screensaver")!;
  ss.hidden = !on;
  if (on) {
    const tick = () => {
      const d = new Date();
      const clock = ss.querySelector(".ss-clock")!;
      const date = ss.querySelector(".ss-date")!;
      clock.textContent = d.toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
      const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      date.textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${names[d.getDay()]}`;
    };
    tick();
    (ss as unknown as { _timer?: ReturnType<typeof setInterval> })._timer = setInterval(tick, 1000);
  } else {
    const t = (ss as unknown as { _timer?: ReturnType<typeof setInterval> })._timer;
    if (t) clearInterval(t);
  }
}

function armScreensaver(): void {
  if (idleTimer) clearTimeout(idleTimer);
  if (document.getElementById("screensaver") && !document.getElementById("screensaver")!.hidden) {
    showScreensaver(false);
  }
  idleTimer = setTimeout(() => showScreensaver(true), IDLE_MS);
}

function bindIdleWatch(): void {
  for (const ev of ["pointermove", "pointerdown", "keydown", "wheel"] as const) {
    window.addEventListener(ev, armScreensaver, { passive: true });
  }
  armScreensaver();
}

async function main(): Promise<void> {
  // 先订阅再播放开机动画，避免壳消息在 boot 期间丢失
  connect({
    onConfig: applyConfig,
    onTick(m) {
      latestTick = m;
      renderTick(m);
    },
    onHistory: setHistory,
    onAutostart(on) {
      flashHint(`AUTOSTART ${on ? "ON" : "OFF"}`);
    },
    onNotice(text) {
      flashHint(text);
    },
  });

  bindHotkeys();
  await boot();
  await pluginsReady; // 插件注册的 widget 要在挂载 dashboard 前就位
  bindEditInteractions(document.getElementById("grid")!);
  document.getElementById("btn-cards")!.addEventListener("click", openCardManager);
  bindIdleWatch();
  document.getElementById("app")!.hidden = false;
  mountPage(currentPage);
}

main();
