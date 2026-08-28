import { el, bar, registerWidget, type Widget } from "./registry";
import type { MetricsTick, SensorsReading } from "../lib/types";

function sensorRow(label: string): HTMLDivElement {
  const row = el("div", "w-row");
  row.append(el("span", "w-label", label));
  row.append(el("span", "w-bar"));
  row.append(el("span", "w-val"));
  return row;
}

function setRow(row: HTMLElement, text: string | null, ratio: number | null): void {
  const b = row.querySelector(".w-bar") as HTMLElement;
  const v = row.querySelector(".w-val") as HTMLElement;
  b.textContent = bar(ratio ?? 0);
  v.textContent = text === null ? "—" : text;
}

registerWidget({
  id: "sensors",
  title: "SENSORS",
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "SENSORS"));
    host.append(sensorRow("CPU °C"), sensorRow("GPU °C"), sensorRow("GPU LOAD"));
    const list = host.querySelectorAll<HTMLElement>(".w-row");
    const head = host.querySelector(".w-head") as HTMLElement;

    return {
      update(m: MetricsTick) {
        const s: SensorsReading | null = m.metrics.sensors ?? null;
        setRow(list[0], s?.cpu_temp != null ? `${s.cpu_temp}°C` : null, s?.cpu_temp != null ? Math.min(1, s.cpu_temp / 100) : null);
        setRow(list[1], s?.gpu_temp != null ? `${s.gpu_temp}°C` : null, s?.gpu_temp != null ? Math.min(1, s.gpu_temp / 100) : null);
        setRow(list[2], s?.gpu_load != null ? `${Math.round(s.gpu_load)}%` : null, s?.gpu_load != null ? s.gpu_load / 100 : null);
        if (!s || (s.cpu_temp == null && s.gpu_temp == null && s.gpu_load == null)) {
          head.textContent = "SENSORS · 需提权 (lhm)";
        } else if (s.gpu_name) {
          head.textContent = `SENSORS · ${s.gpu_name}`;
        }
      },
    };
  },
});
