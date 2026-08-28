import { el, registerWidget, type Widget } from "./registry";
import type { AlertEntry, MetricsTick } from "../lib/types";

/** 通知中心：最近 30 条告警记录（持久化，重启不丢）。 */

let latest: AlertEntry[] | null = null;

registerWidget({
  id: "alertlog",
  title: "ALERTS",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "ALERT LOG"));
    const list = el("div", "w-list al-list");
    host.append(list);

    function render(entries: AlertEntry[] | null): void {
      list.textContent = "";
      if (!entries || entries.length === 0) {
        const empty = el("div", "w-row");
        empty.append(el("span", "w-label", "NO ALERTS"));
        list.append(empty);
        return;
      }
      for (const e of entries.slice(0, 12)) {
        const row = el("div", "w-row al-row");
        const time = el("span", "w-label", new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false }));
        const msg = el("span", "al-msg", e.msg);
        row.append(time, msg);
        list.append(row);
      }
    }

    render(latest);
    return {
      update(m: MetricsTick) {
        const h = m.metrics.alert_history;
        if (h && h.length > 0 && h[0].ts !== (latest?.[0]?.ts ?? 0)) {
          latest = h;
          render(h);
        }
      },
    };
  },
});
