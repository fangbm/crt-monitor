import { el, bar, registerWidget, type Widget } from "./registry";
import type { MetricsTick, SmartReading } from "../lib/types";

/** 磁盘健康卡：温度 / 剩余寿命 / 已用空间（LHM 存储传感器，需提权）。 */
registerWidget({
  id: "smart",
  title: "DISK HEALTH",
  span: 2,
  create(host: HTMLElement): Widget {
    const head = el("div", "w-head", "DISK HEALTH");
    host.append(head);
    const list = el("div", "dh-list");
    host.append(list);
    const rows = new Map<string, HTMLElement>();
    let lastKey = "";

    function ensureRow(name: string): HTMLElement {
      let row = rows.get(name);
      if (!row) {
        row = el("div", "w-row dh-row");
        const label = el("span", "w-label dh-name");
        const b = el("span", "w-bar");
        const val = el("span", "w-val");
        row.append(label, b, val);
        list.append(row);
        rows.set(name, row);
      }
      return row;
    }

    return {
      update(m: MetricsTick) {
        const items: SmartReading[] = m.metrics.smart ?? [];
        const key = items.map((d) => d.name + (d.temp ?? "") + (d.life_pct ?? "")).join("|");
        if (key === lastKey) return;
        lastKey = key;

        if (items.length === 0) {
          head.textContent = "DISK HEALTH · 需提权 (lhm)";
          list.textContent = "";
          return;
        }
        head.textContent = "DISK HEALTH";
        list.textContent = "";
        for (const d of items) {
          const row = ensureRow(d.name);
          (row.querySelector(".dh-name") as HTMLElement).textContent = d.name;
          const b = row.querySelector(".w-bar") as HTMLElement;
          const v = row.querySelector(".w-val") as HTMLElement;
          const parts: string[] = [];
          if (d.temp != null) parts.push(`${d.temp}°C`);
          if (d.life_pct != null) parts.push(`LIFE ${d.life_pct}%`);
          if (d.used_pct != null) parts.push(`USED ${d.used_pct}%`);
          const ratio = d.life_pct != null ? d.life_pct / 100 : d.used_pct != null ? 1 - d.used_pct / 100 : 0;
          b.textContent = bar(ratio);
          v.textContent = parts.join("  ") || "—";
        }
      },
    };
  },
});
