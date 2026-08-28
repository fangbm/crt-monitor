import { el, bar, fmtBytes, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** 远程机器：对端跑 `CrtMonitor --serve` 后在此显示 CPU/内存/网速。 */
registerWidget({
  id: "remote",
  title: "REMOTE",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "REMOTE"));
    const list = el("div", "w-list rm-list");
    host.append(list);
    const rows = new Map<string, HTMLElement>();

    return {
      update(m: MetricsTick) {
        const items = m.metrics.remotes ?? [];
        const seen = new Set<string>();
        for (const r of items) {
          seen.add(r.name);
          let row = rows.get(r.name);
          if (!row) {
            row = el("div", "w-row");
            row.append(el("span", "w-label", r.name));
            row.append(el("span", "w-bar"));
            row.append(el("span", "w-val"));
            list.append(row);
            rows.set(r.name, row);
          }
          const offline = r.age_ms > 10_000;
          const b = row.querySelector(".w-bar") as HTMLElement;
          const v = row.querySelector(".w-val") as HTMLElement;
          if (offline) {
            b.textContent = bar(0);
            v.textContent = "OFFLINE";
            v.style.opacity = "0.5";
          } else {
            b.textContent = bar(r.cpu / 100);
            v.textContent = `${r.cpu.toFixed(0)}% ${fmtBytes(r.mem_used, 0)}`;
            v.style.opacity = "";
          }
        }
        for (const [name, row] of rows) {
          if (!seen.has(name)) row.remove(), rows.delete(name);
        }
      },
    };
  },
});
