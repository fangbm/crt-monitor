import { el, registerWidget, type Widget } from "./registry";
import { getHistory, subscribe } from "../lib/historyStore";
import type { HistoryPoint, MetricsTick } from "../lib/types";

/** 历史曲线：1H / 6H / 24H（分钟）/ 7D（10 分钟降采样），头部按钮切换。 */

type Range = "1h" | "6h" | "24h" | "7d";
const RANGES: Range[] = ["1h", "6h", "24h", "7d"];
const RANGE_SEC: Record<Range, number> = { "1h": 3600, "6h": 21600, "24h": 86400, "7d": 604800 };

let selected: Range = "24h";

function draw(canvas: HTMLCanvasElement, points: HistoryPoint[], spanSec: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const w = canvas.width;
  const h = canvas.height;
  const css = (n: string, f: string) => getComputedStyle(canvas).getPropertyValue(n).trim() || f;
  const phos = css("--phos", "#3dff7c");
  const bright = css("--phos-bright", "#c8ffd9");
  const dim = css("--phos-dim", "#0e5a28");
  const faint = css("--phos-faint", "#07331a");

  ctx.clearRect(0, 0, w, h);

  // 网格：6 竖 + 4 横
  ctx.strokeStyle = faint;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = Math.round((w * i) / 6) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let i = 1; i < 4; i++) {
    const y = Math.round((h * i) / 4) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  if (points.length < 2) {
    ctx.fillStyle = dim;
    ctx.font = `${Math.max(10, h * 0.08)}px monospace`;
    ctx.fillText("COLLECTING…", 10, h / 2);
    return;
  }

  const now = points[points.length - 1].t;
  const cutoff = now - spanSec;
  const win = points.filter((p) => p.t >= cutoff);
  const src = win.length >= 2 ? win : points.slice(-2);

  const t0 = src[0].t;
  const t1 = Math.max(t0 + 60, src[src.length - 1].t);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const y = (v: number) => h - Math.min(1, Math.max(0, v / 100)) * (h - 14) - 2;

  const line = (get: (p: HistoryPoint) => number, color: string, width: number, glow: boolean, dash = false) => {
    ctx.beginPath();
    src.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.t), y(get(p))) : ctx.lineTo(x(p.t), y(get(p)))));
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr;
    if (dash) ctx.setLineDash([4 * dpr, 4 * dpr]);
    if (glow) {
      ctx.shadowColor = phos;
      ctx.shadowBlur = 6 * dpr;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
  };

  // 昨日同时段对比（虚线，10 分钟粒度）
  const all = getHistory();
  if (all?.points10m && all.points10m.length > 2 && spanSec <= 86400) {
    const t0abs = t0;
    const t1abs = t1;
    const shift = 86400;
    const past = all.points10m.filter((p) => p.t >= t0abs - shift && p.t <= t1abs - shift);
    if (past.length > 2) {
      ctx.beginPath();
      past.forEach((p, i) => {
        const px = x(p.t + shift);
        const py = y(p.cpu);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      });
      ctx.strokeStyle = dim;
      ctx.lineWidth = 1 * dpr;
      ctx.setLineDash([3 * dpr, 5 * dpr]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 温度（有 LHM 数据时）：细实线，0-100°C 与占用同轴
  const hasTemp = src.some((p) => (p.temp ?? 0) > 0);
  if (hasTemp) {
    ctx.beginPath();
    src.forEach((p, i) => {
      const px = x(p.t);
      const py = y(p.temp ?? 0);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.strokeStyle = phos;
    ctx.lineWidth = 1.25 * dpr;
    ctx.stroke();
  }

  line((p) => p.cpu_max, dim, 1, false);
  line((p) => p.mem, dim, 1.5, false);
  line((p) => p.cpu, bright, 2, true);

  // x 轴时间标签
  ctx.fillStyle = dim;
  ctx.font = `${Math.max(9, h * 0.06)}px monospace`;
  for (let i = 0; i <= 6; i++) {
    const t = t0 + ((t1 - t0) * i) / 6;
    const showSec = spanSec <= 21600;
    const label = new Date(t * 1000).toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: showSec ? "2-digit" : undefined,
      hour12: false,
    });
    const px = Math.min(w - 34, Math.max(2, (w * i) / 6));
    ctx.fillText(label, px, h - 2);
  }
}

registerWidget({
  id: "hist24",
  title: "HIST",
  span: 5,
  create(host: HTMLElement): Widget {
    const head = el("div", "w-head");
    const label = el("span", "", "HISTORY");
    const range = el("span", "hg-range");
    head.append(label, range);
    host.append(head);
    const legend = el("div", "w-legend", "CPU AVG(亮) / MAX / MEM / TEMP(细) / 昨日(虚线)");
    host.append(legend);
    const canvas = el("canvas", "w-canvas");
    host.append(canvas);

    const buttons = new Map<Range, HTMLElement>();
    for (const rg of RANGES) {
      const b = el("button", `hg-btn${rg === selected ? " on" : ""}`, rg.toUpperCase());
      b.addEventListener("click", () => {
        selected = rg;
        buttons.forEach((btn, k) => btn.classList.toggle("on", k === rg));
        redraw();
      });
      buttons.set(rg, b);
      range.append(b);
    }

    const redraw = () => {
      const h = getHistory();
      if (!h) return;
      const pts = selected === "7d" ? (h.points10m ?? []) : h.points;
      draw(canvas, pts, RANGE_SEC[selected]);
    };
    const unsubscribe = subscribe(redraw);
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(redraw).observe(canvas);

    return {
      update(_m: MetricsTick) {
        redraw();
      },
      destroy() {
        unsubscribe();
      },
    };
  },
});
