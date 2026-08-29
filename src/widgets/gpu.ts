import { el, bar, registerWidget, type Widget } from "./registry";
import type { MetricsTick, SensorsReading } from "../lib/types";

/** GPU 深度卡：负载/温度/显存（需 LHM 提权）。 */
registerWidget({
  id: "gpu",
  title: "GPU",
  span: 2,
  create(host: HTMLElement): Widget {
    const head = el("div", "w-head", "GPU");
    host.append(head);
    const load = el("div", "w-big", "—");
    host.append(load);
    const rows = el("div", "w-list gpu-rows");
    host.append(rows);
    const temp = el("div", "w-row");
    const vram = el("div", "w-row");
    temp.append(el("span", "w-label", "TEMP"));
    temp.append(el("span", "w-bar"), el("span", "w-val"));
    vram.append(el("span", "w-label", "VRAM"));
    vram.append(el("span", "w-bar"), el("span", "w-val"));
    rows.append(temp, vram);

    return {
      update(m: MetricsTick) {
        const s: SensorsReading | null = m.metrics.sensors ?? null;
        const noData = !s || s.gpu_load == null;
        load.textContent = noData ? "N/A" : `${Math.round(s.gpu_load!)}%`;
        head.textContent = noData
          ? "GPU · 需提权 (lhm)"
          : s.gpu_name ? `GPU · ${s.gpu_name}`.slice(0, 34) : "GPU";
        const set = (row: HTMLElement, text: string, ratio: number) => {
          (row.querySelector(".w-bar") as HTMLElement).textContent = bar(ratio);
          (row.querySelector(".w-val") as HTMLElement).textContent = text;
        };
        if (noData) {
          set(temp, "—", 0);
          set(vram, "—", 0);
          return;
        }
        set(temp, s.gpu_temp != null ? `${s.gpu_temp}°C` : "—", s.gpu_temp != null ? Math.min(1, s.gpu_temp / 100) : 0);
        if (s.gpu_mem_total_mb) {
          set(vram, `${Math.round(s.gpu_mem_used_mb ?? 0)}/${Math.round(s.gpu_mem_total_mb)}MB`,
            Math.min(1, (s.gpu_mem_used_mb ?? 0) / s.gpu_mem_total_mb));
        } else {
          set(vram, "—", 0);
        }
      },
    };
  },
});
