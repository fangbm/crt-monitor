import { el, registerWidget, type Widget } from "./registry";
import { getHistory, subscribe } from "../lib/historyStore";
import type { HistoryPoint, MetricsTick } from "../lib/types";

/** 24 小时 CPU/内存曲线（分钟聚合，低频刷新）。 */

function draw(canvas: HTMLCanvasElement, points: HistoryPoint[]): void {
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

  // 网格：每 4 小时一条竖线 + 25% 横线
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

  const t0 = points[0].t;
  const t1 = Math.max(t0 + 60, points[points.length - 1].t);
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const y = (v: number) => h - Math.min(1, Math.max(0, v / 100)) * (h - 14) - 2;

  const line = (get: (p: HistoryPoint) => number, color: string, width: number, glow: boolean) => {
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(x(p.t), y(get(p))) : ctx.lineTo(x(p.t), y(get(p)))));
    ctx.strokeStyle = color;
    ctx.lineWidth = width * dpr;
    if (glow) {
      ctx.shadowColor = phos;
      ctx.shadowBlur = 6 * dpr;
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  };

  line((p) => p.cpu_max, dim, 1, false);
  line((p) => p.mem, dim, 1.5, false);
  line((p) => p.cpu, bright, 2, true);

  // x 轴时间标签（每 4h）
  ctx.fillStyle = dim;
  ctx.font = `${Math.max(9, h * 0.06)}px monospace`;
  for (let i = 0; i <= 6; i++) {
    const t = t0 + ((t1 - t0) * i) / 6;
    const label = new Date(t * 1000).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
    const px = Math.min(w - 30, Math.max(2, (w * i) / 6));
    ctx.fillText(label, px, h - 2);
  }
}

registerWidget({
  id: "hist24",
  title: "HIST24",
  span: 5,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "HISTORY · 24H"));
    const legend = el("div", "w-legend", "CPU AVG(亮) / CPU MAX / MEM");
    host.append(legend);
    const canvas = el("canvas", "w-canvas");
    host.append(canvas);

    const redraw = () => {
      const h = getHistory();
      if (h) draw(canvas, h.points);
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
