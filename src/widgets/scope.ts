import { Scope } from "../lib/chart";
import type { MetricsTick } from "../lib/types";
import { el, fmtRate, registerWidget, type Widget } from "./registry";

type ScopeMetric = "cpu.usage" | "mem.used_pct" | "net.rx_bps" | "net.tx_bps" | "sensors.cpu_temp" | "sensors.gpu_temp";

interface MetricDef {
  label: string;
  unit: string;
  fixedMax?: number;
  read: (m: MetricsTick) => number | null;
  format: (value: number) => string;
}

const METRICS: Record<ScopeMetric, MetricDef> = {
  "cpu.usage": {
    label: "CPU USAGE", unit: "%", fixedMax: 100,
    read: (m) => m.metrics.cpu.usage,
    format: (v) => `${v.toFixed(1)}%`,
  },
  "mem.used_pct": {
    label: "MEMORY USED", unit: "%", fixedMax: 100,
    read: (m) => m.metrics.mem.total_b > 0 ? (m.metrics.mem.used_b / m.metrics.mem.total_b) * 100 : null,
    format: (v) => `${v.toFixed(1)}%`,
  },
  "net.rx_bps": {
    label: "NETWORK RECEIVE", unit: "/s",
    read: (m) => m.metrics.net.rx_bps,
    format: fmtRate,
  },
  "net.tx_bps": {
    label: "NETWORK TRANSMIT", unit: "/s",
    read: (m) => m.metrics.net.tx_bps,
    format: fmtRate,
  },
  "sensors.cpu_temp": {
    label: "CPU TEMPERATURE", unit: "°C", fixedMax: 100,
    read: (m) => m.metrics.sensors?.cpu_temp ?? null,
    format: (v) => `${v.toFixed(1)}°C`,
  },
  "sensors.gpu_temp": {
    label: "GPU TEMPERATURE", unit: "°C", fixedMax: 100,
    read: (m) => m.metrics.sensors?.gpu_temp ?? null,
    format: (v) => `${v.toFixed(1)}°C`,
  },
};

let selectedMetric: ScopeMetric = "cpu.usage";

export function setScopeMetric(metric: string | undefined): boolean {
  const next = metric && metric in METRICS ? metric as ScopeMetric : "cpu.usage";
  const changed = next !== selectedMetric;
  selectedMetric = next;
  return changed;
}

export function scopeMetricLabel(): string {
  return METRICS[selectedMetric].label;
}

registerWidget({
  id: "scope",
  title: "CRT Oscilloscope",
  create(host: HTMLElement): Widget {
    host.classList.add("scope-widget");
    const metric = METRICS[selectedMetric];
    const head = el("div", "scope-head");
    const name = el("span", "scope-name", metric.label);
    const value = el("span", "scope-value", "WAITING");
    head.append(name, value);
    const canvas = el("canvas", "scope-canvas");
    const foot = el("div", "scope-foot");
    foot.append(el("span", "", "TIME →"), el("span", "", `SCALE ${metric.fixedMax ?? "AUTO"} ${metric.unit}`));
    host.append(head, canvas, foot);
    const scope = new Scope(canvas, { channels: 1, fixedMax: metric.fixedMax, capacity: 180 });

    return {
      update(m: MetricsTick) {
        const current = metric.read(m);
        if (current === null || !Number.isFinite(current)) {
          value.textContent = "NO SENSOR DATA";
          return;
        }
        value.textContent = metric.format(current);
        scope.push([current]);
      },
      destroy() {
        scope.dispose();
      },
    };
  },
});
