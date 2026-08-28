import { el, fmtBytes, bar, registerWidget, type Widget } from "./registry";
import type { MetricsTick, MemReading } from "../lib/types";

function memRow(label: string): HTMLDivElement {
  const row = el("div", "w-row");
  row.append(el("span", "w-label", label));
  row.append(el("span", "w-bar"));
  row.append(el("span", "w-val"));
  return row;
}

function updateRow(row: HTMLElement, used: number, total: number): void {
  const ratio = total > 0 ? used / total : 0;
  (row.querySelector(".w-bar") as HTMLElement).textContent = bar(ratio);
  (row.querySelector(".w-val") as HTMLElement).textContent =
    `${fmtBytes(used, 0)} / ${fmtBytes(total, 0)}  ${(ratio * 100).toFixed(0)}%`;
}

registerWidget({
  id: "mem",
  title: "MEM",
  create(host: HTMLElement): Widget {
    host.append(
      el("div", "w-head", "MEMORY"),
      memRow("RAM"),
      memRow("SWAP"),
    );
    const rows = host.querySelectorAll<HTMLElement>(".w-row");
    return {
      update(m: MetricsTick) {
        const mem: MemReading = m.metrics.mem;
        updateRow(rows[0], mem.used_b, mem.total_b);
        updateRow(rows[1], mem.swap_used_b, mem.swap_total_b);
      },
    };
  },
});
