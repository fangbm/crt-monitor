import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick, WeatherReading } from "../lib/types";

/** WMO weather code → 显示图标 */
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

registerWidget({
  id: "weather",
  title: "WEATHER",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "WEATHER"));
    const main = el("div", "w-weather-main");
    const iconEl = el("span", "w-weather-icon", "…");
    const temp = el("span", "w-weather-temp", "--°");
    main.append(iconEl, temp);
    host.append(main);
    const desc = el("div", "w-weather-desc", "FETCHING…");
    const detail = el("div", "w-weather-detail", "");
    host.append(desc, detail);

    return {
      update(m: MetricsTick) {
        const w: WeatherReading | null = m.metrics.weather ?? null;
        if (!w) {
          iconEl.textContent = "—";
          temp.textContent = "--°";
          desc.textContent = "NO DATA";
          detail.textContent = "";
          return;
        }
        iconEl.textContent = icon(w.code);
        temp.textContent = `${Math.round(w.temp_c)}°`;
        desc.textContent = `${w.text}${w.place ? " · " + w.place : ""}`;
        detail.textContent = `RH ${w.humidity}%   WIND ${Math.round(w.wind_kmh)}km/h`;
      },
    };
  },
});
