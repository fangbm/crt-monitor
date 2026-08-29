import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** CPU 每核热力图：格子数固定（核数），列数按卡片宽高比动态求解——
 * 选让格子最接近正方形的排布（12 核：宽扁卡 2x6/1x12，方卡 3x4/4x3，窄高卡 1x12…）。
 * ResizeObserver 驱动，拖拽调整卡片大小后立即重排。 */
registerWidget({
  id: "heatmap",
  title: "CORES",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "CPU CORES"));
    const grid = el("div", "hm-grid");
    host.append(grid);
    const cells: HTMLDivElement[] = [];

    let coreCount = 0;
    let lastCols = 0;

    /** 列数解算：只在整除核数的列数里挑格子最方的（12 → 1/2/3/4/6/12），
     * 保证无残行空缺；仅当没有任何整除候选能容纳时才放宽到其它列数。 */
    function computeCols(w: number, h: number, n: number): number {
      const fits = (c: number) => w / c >= 26 && h / Math.ceil(n / c) >= 18;
      const squarest = (pool: number[]): number => {
        let best = pool[0];
        let bestPenalty = Number.POSITIVE_INFINITY;
        for (const c of pool) {
          const penalty = Math.abs(Math.log2(w / c / (h / Math.ceil(n / c))));
          if (penalty < bestPenalty) {
            bestPenalty = penalty;
            best = c;
          }
        }
        return best;
      };

      const all: number[] = [];
      const divisors: number[] = [];
      for (let c = 1; c <= n; c++) {
        if (!fits(c)) continue;
        all.push(c);
        if (n % c === 0) divisors.push(c);
      }
      if (all.length === 0) return Math.max(1, Math.min(n, 6));
      return squarest(divisors.length > 0 ? divisors : all);
    }

    function relayout(): void {
      if (coreCount === 0) return;
      const r = grid.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      const cols = computeCols(r.width, r.height, coreCount);
      if (cols !== lastCols) {
        lastCols = cols;
        grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
      }
    }

    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(relayout).observe(grid);
    }

    return {
      update(m: MetricsTick) {
        const cores = m.metrics.cpu.cores;
        if (cells.length !== cores.length) {
          grid.textContent = "";
          cells.length = 0;
          coreCount = cores.length;
          lastCols = 0;
          for (let i = 0; i < coreCount; i++) {
            const cell = el("div", "hm-cell");
            const num = el("span", "hm-num", String(i + 1));
            cell.append(num);
            grid.append(cell);
            cells.push(cell);
          }
          relayout();
        }
        cores.forEach((v, i) => {
          const t = Math.min(1, Math.max(0, v / 100));
          cells[i].style.background = `color-mix(in srgb, var(--phos) ${Math.round(t * 85)}%, transparent)`;
          cells[i].style.borderColor = t > 0.85 ? "var(--phos-bright)" : "var(--phos-dim)";
          const num = cells[i].firstElementChild as HTMLElement;
          num.style.opacity = t > 0.55 ? "1" : "0.35";
        });
      },
    };
  },
});
