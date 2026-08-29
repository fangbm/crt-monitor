import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** Ping 延迟/丢包：每目标一行 + 60 点迷你曲线（丢包画到底部缺口）。 */
registerWidget({
  id: "ping",
  title: "PING",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "PING"));
    const list = el("div", "pg-list");
    host.append(list);
    const rows = new Map<string, { root: HTMLElement; canvas: HTMLCanvasElement; label: HTMLElement }>();

    function draw(canvas: HTMLCanvasElement, series: number[]): void {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      const w = canvas.width;
      const h = canvas.height;
      const phos = getComputedStyle(canvas).getPropertyValue("--phos").trim() || "#3dff7c";
      ctx.clearRect(0, 0, w, h);
      if (series.length < 2) return;
      const ok = series.filter((v) => v >= 0);
      const max = Math.max(20, ...ok) * 1.2;
      ctx.beginPath();
      let started = false;
      series.forEach((v, i) => {
        const x = (i / (series.length - 1)) * w;
        if (v < 0) {
          // 丢包：落到底部形成缺口
          if (started) ctx.lineTo(x, h - 1);
          started = false;
          return;
        }
        const y = h - Math.min(1, v / max) * (h - 4) - 2;
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      });
      ctx.strokeStyle = phos;
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
    }

    return {
      update(m: MetricsTick) {
        const pings = m.metrics.pings ?? [];
        const seen = new Set<string>();
        for (const p of pings) {
          seen.add(p.name);
          let row = rows.get(p.name);
          if (!row) {
            const root = el("div", "pg-row");
            const label = el("div", "pg-label");
            const canvas = el("canvas", "pg-canvas");
            root.append(label, canvas);
            list.append(root);
            row = { root, canvas, label };
            rows.set(p.name, row);
          }
          const lost = p.ms < 0;
          row.label.innerHTML =
            `${p.name} <b>${lost ? "LOST" : p.ms + "ms"}</b>` +
            (p.lost_pct > 0 ? ` <span class="pg-lost">${p.lost_pct}%</span>` : "");
          draw(row.canvas, p.series);
        }
        for (const [name, row] of rows) {
          if (!seen.has(name)) row.root.remove(), rows.delete(name);
        }
      },
    };
  },
});
