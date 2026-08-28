import { el, fmtRate, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** 分网卡速率：每行一个网卡（按总流量排序，最多 6 条）。 */
registerWidget({
  id: "netnic",
  title: "NIC",
  span: 1,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "PER-NIC"));
    const list = el("div", "w-list nn-list");
    host.append(list);
    const rows = new Map<string, HTMLElement>();

    return {
      update(m: MetricsTick) {
        const nics = m.metrics.net.nics ?? [];
        const seen = new Set<string>();
        for (const n of nics) {
          seen.add(n.name);
          let row = rows.get(n.name);
          if (!row) {
            row = el("div", "w-row");
            row.append(el("span", "w-label", n.name));
            row.append(el("span", "w-val"));
            list.append(row);
            rows.set(n.name, row);
          }
          (row.querySelector(".w-val") as HTMLElement).textContent =
            `↓${fmtRate(n.rx_bps)} ↑${fmtRate(n.tx_bps)}`;
        }
        for (const [name, row] of rows) {
          if (!seen.has(name)) row.remove(), rows.delete(name);
        }
      },
    };
  },
});
