import { el, registerWidget, type Widget } from "./registry";
import type { ForecastDay, MetricsTick } from "../lib/types";

function icon(code: number): string {
  if (code === 0) return "☀";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁";
  if (code <= 48) return "🌫";
  if (code <= 57) return "🌦";
  if (code <= 67) return "🌧";
  if (code <= 77) return "🌨";
  if (code <= 82) return "🌧";
  if (code <= 86) return "🌨";
  return "⛈";
}

/** 3 日天气预报。 */
registerWidget({
  id: "weather3",
  title: "FORECAST",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "3-DAY FORECAST"));
    const list = el("div", "wf-list");
    host.append(list);
    const rows: Array<{ day: HTMLElement; ic: HTMLElement; range: HTMLElement }> = [];

    function render(f: ForecastDay[]): void {
      while (rows.length < f.length) {
        const row = el("div", "wf-row");
        const day = el("span", "wf-day");
        const ic = el("span", "wf-ic");
        const range = el("span", "wf-range");
        row.append(day, ic, range);
        list.append(row);
        rows.push({ day, ic, range });
      }
      const now = new Date();
      f.forEach((d, i) => {
        const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i + 1);
        const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
        rows[i].day.textContent = names[date.getDay()];
        rows[i].ic.textContent = icon(d.code);
        rows[i].range.textContent = `${Math.round(d.min_c)}° / ${Math.round(d.max_c)}°`;
      });
    }

    return {
      update(m: MetricsTick) {
        const f = m.metrics.weather?.forecast ?? [];
        if (f.length > 0) render(f);
      },
    };
  },
});
