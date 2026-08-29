import { el, registerWidget, type Widget } from "./registry";
import type { EventReading, MetricsTick } from "../lib/types";

/** 系统事件卡：最近 24h 错误/警告（新→旧）。 */
registerWidget({
  id: "events",
  title: "EVENTS",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "SYSTEM EVENTS"));
    const list = el("div", "w-list ev-list");
    host.append(list);
    let lastTs = -1;

    function render(items: EventReading[]): void {
      list.textContent = "";
      if (items.length === 0) {
        const empty = el("div", "w-row");
        empty.append(el("span", "w-label", "CLEAN · 24H"));
        list.append(empty);
        return;
      }
      for (const e of items.slice(0, 8)) {
        const row = el("div", `w-row ev-row ${e.level}`);
        const time = el("span", "w-label",
          new Date(e.ts).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" }));
        const msg = el("span", "ev-msg", `${e.source}: ${e.msg}`);
        row.append(time, msg);
        list.append(row);
      }
    }

    return {
      update(m: MetricsTick) {
        const items = m.metrics.events ?? [];
        const head = items[0]?.ts ?? -1;
        if (head !== lastTs) {
          lastTs = head;
          render(items);
        }
      },
    };
  },
});
