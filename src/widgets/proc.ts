import { conf, el, fmtBytes, bar, registerWidget, type Widget } from "./registry";
import type { MetricsTick, ProcReading } from "../lib/types";

interface Row {
  root: HTMLElement;
  label: HTMLElement;
  bar: HTMLElement;
  val: HTMLElement;
}

registerWidget({
  id: "proc",
  title: "PROC",
  span: 3,
  create(host: HTMLElement): Widget {
    // cardconf 在 config 消息里，import 时还没到——必须在 create() 时读
    const topN = conf<{ count: number }>("proc", { count: 8 }).count;
    host.append(el("div", "w-head", "PROCESSES (CPU)"));
    const list = el("div", "w-list w-proc");
    host.append(list);
    const rows: Row[] = [];

    function ensureRow(i: number): Row {
      if (i < rows.length) return rows[i];
      const root = el("div", "w-row");
      const label = el("span", "w-label");
      const b = el("span", "w-bar");
      const val = el("span", "w-val");
      root.append(label, b, val);
      list.append(root);
      const row = { root, label, bar: b, val };
      rows.push(row);
      return row;
    }

    return {
      update(m: MetricsTick) {
        const procs: ProcReading[] = m.metrics.proc ?? [];
        for (let i = 0; i < procs.length && i < topN; i++) {
          const p = procs[i];
          const row = ensureRow(i);
          row.label.textContent = p.name.length > 16 ? p.name.slice(0, 15) + "…" : p.name;
          row.bar.textContent = bar(p.cpu / 100);
          row.val.textContent = `${p.cpu.toFixed(1)}%  ${fmtBytes(p.mem_b, 1)}`;
        }
        // 进程数减少时隐藏多余行
        for (let i = procs.length; i < rows.length; i++) rows[i].root.style.display = "none";
        for (let i = 0; i < Math.min(procs.length, topN); i++) rows[i].root.style.display = "";
      },
    };
  },
});
