import { el, registerWidget, type Widget } from "./registry";
import type { BootReading, MetricsTick } from "../lib/types";

const HHMM = (sec: number) =>
  new Date(sec * 1000).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" });
const MD = (sec: number) => {
  const d = new Date(sec * 1000);
  return `${d.getMonth() + 1}/${d.getDate()} ${HHMM(sec)}`;
};

/** 开机统计：本次开机时间 / 上次关机时间 / 运行时长。 */
registerWidget({
  id: "boot",
  title: "BOOT",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "BOOT"));
    const list = el("div", "w-list");
    host.append(list);
    const rows: Record<string, HTMLElement> = {};
    for (const k of ["BOOTED", "SHUTDOWN", "UPTIME"]) {
      const row = el("div", "w-row");
      row.append(el("span", "w-label", k));
      row.append(el("span", "w-bar", "·"));
      row.append(el("span", "w-val", "—"));
      list.append(row);
      rows[k] = row.querySelector(".w-val") as HTMLElement;
    }

    return {
      update(m: MetricsTick) {
        const b: BootReading | null = m.metrics.boot ?? null;
        if (!b) return;
        rows.BOOTED.textContent = MD(b.booted_at);
        rows.SHUTDOWN.textContent = b.last_shutdown > 0 ? MD(b.last_shutdown) : "—";
        const up = m.uptime;
        const d = Math.floor(up / 86400);
        const h = Math.floor((up % 86400) / 3600);
        const min = Math.floor((up % 3600) / 60);
        rows.UPTIME.textContent = d > 0 ? `${d}d ${h}h` : `${h}h ${min}m`;
      },
    };
  },
});
