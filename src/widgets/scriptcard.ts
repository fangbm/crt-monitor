import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** 脚本数据源：config.json scripts 里每条命令的 stdout 首行。 */
registerWidget({
  id: "scripts",
  title: "SCRIPTS",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "CUSTOM"));
    const list = el("div", "w-list sc-list");
    host.append(list);
    const rows = new Map<string, HTMLElement>();

    return {
      update(m: MetricsTick) {
        const items = m.metrics.scripts ?? [];
        const seen = new Set<string>();
        for (const s of items) {
          seen.add(s.name);
          let row = rows.get(s.name);
          if (!row) {
            row = el("div", "w-row");
            row.append(el("span", "w-label", s.name));
            row.append(el("span", "w-val"));
            list.append(row);
            rows.set(s.name, row);
          }
          (row.querySelector(".w-val") as HTMLElement).textContent =
            s.age_ms >= 0 && s.age_ms < 60_000 ? s.value : `${s.value} (stale)`;
        }
        for (const [name, row] of rows) {
          if (!seen.has(name)) row.remove(), rows.delete(name);
        }
      },
    };
  },
});
