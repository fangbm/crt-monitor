import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** CPU 每核热力图：一格一核，亮度 = 占用率。多核场景比曲线直观。 */
registerWidget({
  id: "heatmap",
  title: "CORES",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "CPU CORES"));
    const grid = el("div", "hm-grid");
    host.append(grid);
    const cells: HTMLDivElement[] = [];

    return {
      update(m: MetricsTick) {
        const cores = m.metrics.cpu.cores;
        if (cells.length !== cores.length) {
          grid.textContent = "";
          cells.length = 0;
          for (let i = 0; i < cores.length; i++) {
            const cell = el("div", "hm-cell");
            const num = el("span", "hm-num", String(i + 1));
            cell.append(num);
            grid.append(cell);
            cells.push(cell);
          }
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
