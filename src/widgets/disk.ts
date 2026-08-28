import { el, fmtBytes, fmtRate, bar, registerWidget, type Widget } from "./registry";
import type { MetricsTick, DiskReading } from "../lib/types";

interface Row {
  root: HTMLElement;
  bar: HTMLElement;
  val: HTMLElement;
  io: HTMLElement;
}

registerWidget({
  id: "disk",
  title: "DISK",
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "DISKS"));
    const list = el("div", "w-list");
    host.append(list);
    const rows = new Map<string, Row>();

    function ensureRow(d: DiskReading): Row {
      let row = rows.get(d.mount);
      if (!row) {
        const root = el("div", "w-row w-disk");
        const label = el("span", "w-label", d.mount);
        const b = el("span", "w-bar");
        const val = el("span", "w-val");
        const io = el("div", "w-io");
        root.append(label, b, val, io);
        list.append(root);
        row = { root, bar: b, val, io };
        rows.set(d.mount, row);
      }
      return row;
    }

    return {
      update(m: MetricsTick) {
        for (const d of m.metrics.disks) {
          const row = ensureRow(d);
          const ratio = d.total_b > 0 ? 1 - d.available_b / d.total_b : 0;
          row.bar.textContent = bar(ratio);
          row.val.textContent = fmtBytes(d.total_b - d.available_b, 0);
          row.io.textContent = `R ${fmtRate(d.read_bps)}  W ${fmtRate(d.write_bps)}`;
        }
      },
    };
  },
});
