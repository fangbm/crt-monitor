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
  formatDiv?: (value: number) => string;
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
    formatDiv: (v) => `${fmtRate(v)}/DIV`,
  },
  "net.tx_bps": {
    label: "NETWORK TRANSMIT", unit: "/s",
    read: (m) => m.metrics.net.tx_bps,
    format: fmtRate,
    formatDiv: (v) => `${fmtRate(v)}/DIV`,
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
const SWEEP_CAPACITY = 200;

export function scopeMetricIds(): ScopeMetric[] {
  return Object.keys(METRICS) as ScopeMetric[];
}

export function currentScopeMetric(): ScopeMetric {
  return selectedMetric;
}

export function setScopeMetric(metric: string | undefined): boolean {
  const next = metric && metric in METRICS ? metric as ScopeMetric : "cpu.usage";
  const changed = next !== selectedMetric;
  selectedMetric = next;
  return changed;
}

export function scopeMetricLabel(): string {
  return METRICS[selectedMetric].label;
}

function fmtDiv(value: number, unit: string): string {
  const digits = value >= 100 || value === Math.round(value) ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}/DIV`;
}

function fmtTime(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms/DIV`;
  return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} SEC/DIV`;
}

registerWidget({
  id: "scope",
  title: "CRT Oscilloscope",
  create(host: HTMLElement): Widget {
    host.classList.add("scope-widget");
    const metric = METRICS[selectedMetric];
    const head = el("div", "scope-head");
    const name = el("span", "scope-name", `CH1 · ${metric.label}`);
    const value = el("span", "scope-value", "WAITING");
    head.append(name, value);
    const canvas = el("canvas", "scope-canvas");
    const foot = el("div", "scope-foot");
    const vertical = el("span", "", "VERT —");
    const time = el("span", "", fmtTime(1));
    const average = el("span", "", "AVG —");
    const peak = el("span", "", "PEAK —");
    const run = el("span", "scope-run", "● RUN");
    foot.append(vertical, time, average, peak, run);
    host.append(head, canvas, foot);
    // 壳端专用采集器按 20Hz 推送：10 秒扫过 10 格，全部是真实样本。
    const capacity = SWEEP_CAPACITY;
    let scope: Scope | null = null;
    const samples: number[] = [];
    const ensureScope = (m: MetricsTick): Scope => {
      if (scope) return scope;
      const channels = selectedMetric === "cpu.usage" ? Math.max(1, m.metrics.cpu.cores.length + 1) : 1;
      if (selectedMetric === "cpu.usage" && m.metrics.cpu.cores.length > 0)
        name.textContent = `CH1 · CPU USAGE · ${m.metrics.cpu.cores.length} CORES`;
      scope = new Scope(canvas, {
        channels,
        fixedMax: metric.fixedMax,
        capacity,
        oscilloscope: true,
        persistence: 1,
        persistenceMs: 20_000,
        beam: true,
      });
      return scope;
    };
    const drawSample = (next: number, waveform: number[], m: MetricsTick) => {
      samples.push(next);
      if (samples.length > capacity) samples.shift();
      const max = metric.fixedMax ?? Math.max(1, ...samples) * 1.15;
      const avg = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;
      value.textContent = metric.format(next);
      vertical.textContent = `VERT ${metric.formatDiv?.(max / 8) ?? fmtDiv(max / 8, metric.unit)}`;
      average.textContent = `AVG ${metric.format(avg)}`;
      peak.textContent = `PEAK ${metric.format(Math.max(...samples))}`;
      ensureScope(m).push(waveform);
    };

    return {
      update(m: MetricsTick) {
        const current = metric.read(m);
        if (current === null || !Number.isFinite(current)) {
          value.textContent = "NO SENSOR DATA";
          return;
        }
        const waveform = selectedMetric === "cpu.usage"
          ? [...m.metrics.cpu.cores, current]
          : [current];
        drawSample(current, waveform, m);
      },
      destroy() {
        scope?.dispose();
      },
    };
  },
});
