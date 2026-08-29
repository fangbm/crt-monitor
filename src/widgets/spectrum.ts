import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** 音频频谱：24 频段竖条 + 峰值保持缓降（config "spectrum": true 启用采集）。 */
registerWidget({
  id: "spectrum",
  title: "SPECTRUM",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "SPECTRUM"));
    const canvas = el("canvas", "sp-canvas");
    host.append(canvas);
    const ctx = canvas.getContext("2d")!;
    let peaks: number[] = [];
    let lastDataAt = 0;

    function draw(values: number[]): void {
      const dpr = window.devicePixelRatio || 1;
      const r = canvas.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const w = canvas.width;
      const h = canvas.height;
      const css = (n: string, f: string) => getComputedStyle(canvas).getPropertyValue(n).trim() || f;
      const phos = css("--phos", "#3dff7c");
      const bright = css("--phos-bright", "#c8ffd9");
      ctx.clearRect(0, 0, w, h);

      const n = values.length;
      const gap = 3 * dpr;
      const bw = (w - gap * (n - 1)) / n;
      if (peaks.length !== n) peaks = new Array(n).fill(0);

      const now = Date.now();
      if (values.some((v) => v > 0.01)) lastDataAt = now;

      for (let i = 0; i < n; i++) {
        // 无音频时整体缓降归零
        const v = now - lastDataAt > 1200 ? 0 : values[i];
        const bh = Math.max(2 * dpr, v * (h - 6 * dpr));
        const x = i * (bw + gap);
        ctx.fillStyle = phos;
        ctx.shadowColor = phos;
        ctx.shadowBlur = 6 * dpr;
        ctx.fillRect(x, h - bh, bw, bh);
        ctx.shadowBlur = 0;
        // 峰值帽
        peaks[i] = Math.max(v, peaks[i] - 0.008);
        const py = h - Math.max(2 * dpr, peaks[i] * (h - 6 * dpr)) - 2 * dpr;
        ctx.fillStyle = bright;
        ctx.fillRect(x, py, bw, 2 * dpr);
      }
    }

    return {
      update(m: MetricsTick) {
        draw(m.metrics.spectrum ?? []);
      },
    };
  },
});
