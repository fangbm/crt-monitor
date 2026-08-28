import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

registerWidget({
  id: "clock",
  title: "TIME",
  span: 3,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "TIME"));
    const time = el("div", "w-clock", "--:--:--");
    const date = el("div", "w-date", "----");
    host.append(time, date);
    return {
      update(m: MetricsTick) {
        const d = new Date(m.ts);
        time.textContent = d.toLocaleTimeString("zh-CN", { hour12: false });
        date.textContent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${WEEKDAYS[d.getDay()]}`;
      },
    };
  },
});
