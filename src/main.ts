import { connect, postCommand, type PageWidget, type PageInfo, type ShellConfig } from "./lib/transport";
import "./style.css";
import { applyTheme, setDefaultEffects, setThemeCatalog, themeIds, themeList } from "./lib/theme";
import type { MetricsTick } from "./lib/types";
import { setHistory } from "./lib/historyStore";
import { registeredWidgets, setCardConf, el, type Widget, type WidgetDef } from "./widgets/registry";
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
import "./widgets/media";
import "./widgets/netnic";
import "./widgets/scriptcard";
import "./widgets/remotecard";
import "./widgets/ping";
import "./widgets/events";
import "./widgets/gpu";
import "./widgets/boot";
import "./widgets/spectrum";
import "./widgets/diskhealth";

const LOGO = String.raw`  ____ ____  ____    ____
 / ___/ ___||  _ \  |  _ \ ___  __ _ _   _  ___
| |   \___ \| |_) | | |_) / _ \/ _` + "`" + String.raw` | | | |/ _ \
| |___ ___) |  _ <  |  _ <  __/ (_| | |_| |  __/
 \____|____/|_| \_\ |_| \_\___|\__, |\__,_|\___/
                                |_|  MONITOR v1.0`;
const BOOT_LINES = [
  "CRT-MONITOR BIOS v1.0  (c) 2026",
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
      { id: "gpu", x: 68, y: 52, w: 16, h: 48 },
      { id: "leds", x: 84, y: 52, w: 16, h: 24 },
      { id: "sensors", x: 84, y: 76, w: 16, h: 24 },
    ],
  },
  {
    name: "LIFE",
    widgets: [
      { id: "clock", x: 0, y: 0, w: 60, h: 68 },
      { id: "weather", x: 60, y: 0, w: 40, h: 44 },
      { id: "weather3", x: 60, y: 44, w: 40, h: 24 },
      { id: "media", x: 0, y: 68, w: 60, h: 32 },
      { id: "boot", x: 60, y: 68, w: 40, h: 32 },
    ],
  },
  {
    name: "NET",
    widgets: [
      { id: "ping", x: 0, y: 0, w: 100, h: 55 },
      { id: "netnic", x: 0, y: 55, w: 50, h: 45 },
      { id: "stats", x: 50, y: 55, w: 50, h: 45 },
    ],
  },
  {
    name: "HIST",
    widgets: [
      { id: "hist24", x: 0, y: 0, w: 100, h: 62 },
      { id: "alertlog", x: 0, y: 62, w: 50, h: 38 },
      { id: "events", x: 50, y: 62, w: 50, h: 38 },
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
let shellBurnin: string | undefined;
let profiles: string[] | null = null;
let currentProfile: string | null = null;
let themeSchedule: Array<{ from: string; to: string; theme: string }> | null = null;

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

/** 布局预设：壳端轮换 profile 并重发 config（本函数只触发 + 提示）。 */
function cycleProfile(): void {
  if (!profiles || profiles.length < 2) {
    flashHint("NO PROFILES");
    return;
  }
  postCommand("switch-profile");
  const idx = profiles.indexOf(currentProfile ?? "");
  const next = profiles[(idx + 1 + profiles.length) % profiles.length];
  currentProfile = next;
  flashHint(`PROFILE: ${next}`);
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

/** 对齐辅助线：在网格上画横/竖参考线（百分比位置）。 */
function showGuides(vx: number | null, hy: number | null): void {
  const host = document.getElementById("guides")!;
  host.hidden = vx === null && hy === null;
  if (host.hidden) return;
  host.textContent = "";
  if (vx !== null) {
    const v = el("div", "guide guide-v");
    v.style.left = `${vx}%`;
    host.append(v);
  }
  if (hy !== null) {
    const h = el("div", "guide guide-h");
    h.style.top = `${hy}%`;
    host.append(h);
  }
}

function hideGuides(): void {
  const host = document.getElementById("guides")!;
  host.hidden = true;
  host.textContent = "";
}

const ZONE_CURSOR: Record<DragMode, string> = {  move: "move",
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

      // 对齐辅助线：与其他卡片的边/中心在阈值内时吸附并画线
      const TH = 1.2;
      let gx: number | null = null;
      let gy: number | null = null;
      for (const other of mounted) {
        if (other === drag.cell) continue;
        if (gx === null) {
          const myXs = [p.x, p.x + p.w / 2, p.x + p.w];
          const oXs = [other.pos.x, other.pos.x + other.pos.w / 2, other.pos.x + other.pos.w];
          for (const a of myXs) for (const b of oXs) {
            if (Math.abs(a - b) <= TH) {
              p.x -= a - b;
              gx = b;
              break;
            }
          }
          if (gx !== null) for (const a of [p.y, p.y + p.h / 2, p.y + p.h]) for (const b of [other.pos.y, other.pos.y + other.pos.h / 2, other.pos.y + other.pos.h]) {
            if (Math.abs(a - b) <= TH) { p.y -= a - b; gy = b; break; }
          }
        }
      }
      showGuides(gx, gy);
    } else {
      hideGuides();
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
    hideGuides();
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

let hintTimer: ReturnType<typeof setTimeout> | null = null;

function flashHint(text: string): void {
  const hint = document.getElementById("hint");
  if (!hint) return;
  if (hintTimer) clearTimeout(hintTimer); // 连续提示时不让旧的定时器清掉新文本
  hint.textContent = text;
  hintTimer = setTimeout(() => {
    if (!document.body.classList.contains("edit")) hint.textContent = "";
    hintTimer = null;
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
  // 保留滚动位置：点击切换会整体重建列表，不还原的话会跳回顶部
  const oldList = panel.querySelector(".cm-list");
  const scrollTop = oldList?.scrollTop ?? 0;
  panel.textContent = "";

  const head = el("div", "cm-head");
  head.append(el("span", "", `CARDS · ${pages[currentPage].name}`));
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
    if (active) {
      const edit = el("button", "cm-edit", "✎");
      edit.addEventListener("click", (e) => {
        e.stopPropagation();
        openThemeEditor(t.id, t.name);
      });
      row.append(edit);
    }
    row.addEventListener("click", () => switchTheme(t.id));
    list.append(row);
  }

  const foot = el("div", "cm-foot", "插件：exe 目录 plugins/*.dll(js) 自动加载");
  panel.append(head, list, foot);
  // 布局完成后才能正确设置 scrollTop（内容未排版时会被钳到 0）
  requestAnimationFrame(() => (list.scrollTop = scrollTop));
}

function openCardManager(): void {
  const panel = document.getElementById("card-manager")!;
  panel.hidden = false;
  renderCardManager();
}

/* ---------- 主题编辑器：调五色实时预览，写回 themes/{id}.json ---------- */

const THEME_KEYS: Array<[string, string]> = [
  ["--phos", "主色"],
  ["--phos-bright", "高亮"],
  ["--phos-dim", "次要"],
  ["--phos-faint", "网格"],
  ["--bg", "背景"],
];

function openThemeEditor(id: string, name: string): void {
  const panel = document.getElementById("card-manager")!;
  const current = getComputedStyle(document.documentElement);
  panel.textContent = "";

  const head = el("div", "cm-head");
  head.append(el("span", "", `EDIT · ${name}`));
  const close = el("button", "cm-close", "×");
  close.addEventListener("click", () => renderCardManager());
  head.append(close);

  const form = el("div", "te-form");
  const nameInput = el("input", "te-name") as HTMLInputElement;
  nameInput.value = name;
  form.append(el("div", "te-label", "NAME"), nameInput);

  const vars: Record<string, string> = {};
  for (const [key, label] of THEME_KEYS) {
    const value = current.getPropertyValue(key).trim() || "#000000";
    vars[key] = value;
    const row = el("div", "te-row");
    row.append(el("div", "te-label", label));
    const input = el("input", "te-color") as HTMLInputElement;
    input.type = "color";
    input.value = toHex(value);
    input.addEventListener("input", () => {
      vars[key] = input.value;
      document.documentElement.style.setProperty(key, input.value); // 实时预览
    });
    row.append(input);
    form.append(row);
  }

  const save = el("button", "te-save", "SAVE");
  save.addEventListener("click", () => {
    const finalName = nameInput.value.trim() || id;
    setThemeCatalog([{ id, name: finalName, vars }]);
    applyTheme(id);
    postCommand("save-theme", { id, name: finalName, vars });
    flashHint(`THEME SAVED: ${id}`);
    currentTheme = id;
    renderCardManager();
  });
  const cancel = el("button", "te-cancel", "CANCEL");
  cancel.addEventListener("click", () => {
    applyTheme(id); // 还原
    renderCardManager();
  });
  form.append(save, cancel);

  panel.append(head, form);
}

function toHex(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  // rgb()/color-mix() 等取不到精确值时回退中性色
  return "#3dff7c";
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
  shellBurnin = c.burnin;
  applyBurninMode(c.burnin);
  setCardConf(c.cardconf);
  profiles = c.profiles ?? null;
  currentProfile = c.profile ?? null;
  themeSchedule = c.theme_schedule ?? null;
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
  } else if (code === "KeyG") {
    postCommand("export-csv");
  } else if (code === "KeyA") {
    postCommand("toggle-autostart");
  } else if (code === "KeyT") {
    cycleTheme();
    } else if (code === "KeyP") {
      cycleProfile();
    } else if (code === "Digit1") switchTheme("green");
  else if (code === "Digit2") switchTheme("amber");
  else if (code === "Digit3") switchTheme("white");
};

/** 顶栏 = 无边框窗口的标题栏：按住拖动移窗，双击切全屏（F11 窗口化后拖回来用）。 */
function bindHeaderDrag(): void {
  const hd = document.getElementById("hd")!;
  hd.addEventListener("pointerdown", (e) => {
    if (!window.chrome?.webview) return;
    if ((e.target as HTMLElement).closest("button")) return;
    postCommand("drag-window");
  });
  hd.addEventListener("dblclick", () => postCommand("toggle-fullscreen"));
}

function bindHotkeys(): void {
  window.addEventListener("keydown", (e) => {
    if (e.key === "?") {
      e.preventDefault();
      toggleHelp();
      return;
    }
    if (e.key === "F11" || e.key === "Tab") e.preventDefault();
    (globalThis as Record<string, unknown>).__shiftTab = e.shiftKey;
    ((globalThis as Record<string, unknown>).__hotkey as (c: string, k?: string) => void)(e.code, e.key);
  });
}

/* ---------- 防灼屏微抖：整页低频小幅漂移，让亮区不停留 ---------- */

let driftTimer: ReturnType<typeof setInterval> | null = null;

function startBurninDrift(): void {
  if (driftTimer) return;
  const app = document.getElementById("app")!;
  const boot = document.getElementById("boot");
  driftTimer = setInterval(() => {
    // ±6px 随机缓移，transition 让移动平滑不可感
    const x = (Math.random() * 12 - 6).toFixed(1);
    const y = (Math.random() * 12 - 6).toFixed(1);
    app.style.transform = `translate(${x}px, ${y}px)`;
    if (boot) boot.style.transform = app.style.transform;
  }, 30_000);
}

function stopBurninDrift(): void {
  if (driftTimer) {
    clearInterval(driftTimer);
    driftTimer = null;
    document.getElementById("app")!.style.transform = "";
    const boot = document.getElementById("boot");
    if (boot) boot.style.transform = "";
  }
}

function applyBurninMode(mode: string | undefined): void {
  stopBurninDrift();
  if (mode === "off") return;
  if (mode === "idle") {
    // 仅屏保期间不需要漂移（屏保本身在切换），退出屏保常开无意义——跟随屏保状态
    // idle 模式：屏保显示时漂移时钟层，由 screensaver 内部处理；这里不常开
    return;
  }
  startBurninDrift(); // always（默认）
}

/* ---------- 主题定时轮换：时段内自动套用（from/to "HH:mm"，支持跨零点） ---------- */

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function checkThemeSchedule(): void {
  if (!themeSchedule || themeSchedule.length === 0) return;
  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();
  for (const p of themeSchedule) {
    const from = minutesOf(p.from);
    const to = minutesOf(p.to);
    const inRange = from <= to ? cur >= from && cur < to : cur >= from || cur < to;
    if (inRange && currentTheme !== p.theme) {
      currentTheme = p.theme;
      applyTheme(p.theme);
      postCommand("set-theme", p.theme);
      flashHint(`THEME SCHEDULE: ${p.theme.toUpperCase()}`);
    }
  }
}

/* ---------- 快捷键帮助浮层（? 键） ---------- */

const HOTKEYS: Array<[string, string]> = [
  ["Tab", "切换页面"],
  ["E", "布局编辑模式"],
  ["C", "卡片管理器（编辑模式内）"],
  ["P", "切换布局预设"],
  ["S", "截图"],
  ["G", "导出历史 CSV"],
  ["T / 1 / 2 / 3", "切换主题"],
  ["F11", "全屏 ⇄ 窗口化（顶栏可拖动，双击顶栏切全屏）"],
  ["Esc", "隐藏到托盘"],
  ["R", "重载前端"],
  ["A", "开机自启开关"],
  ["?", "本帮助"],
];

function toggleHelp(): void {
  const panel = document.getElementById("hotkeys")!;
  if (!panel.hidden) {
    panel.hidden = true;
    return;
  }
  panel.textContent = "";
  const title = el("div", "hk-title", "HOTKEYS");
  panel.append(title);
  for (const [key, desc] of HOTKEYS) {
    const row = el("div", "hk-row");
    row.append(el("span", "hk-key", key));
    row.append(el("span", "hk-desc", desc));
    panel.append(row);
  }
  panel.append(el("div", "hk-foot", "点击任意处关闭"));
  panel.hidden = false;
}

function bindHelp(): void {
  document.getElementById("hotkeys")!.addEventListener("click", toggleHelp);
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
  bindHeaderDrag();
  bindHelp();
  applyBurninMode(shellBurnin);
  setInterval(checkThemeSchedule, 30_000);  document.getElementById("app")!.hidden = false;
  mountPage(currentPage);
}

main();
