import { conf, el, fmtBytes, bar, registerWidget, type Widget } from "./registry";
import { postCommand } from "../lib/transport";
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
      // 点击两下杀进程：第一次进入确认态（变红），再点执行，3 秒不点取消
      let confirmTimer: ReturnType<typeof setTimeout> | null = null;
      root.addEventListener("click", () => {
        const name = row.label.dataset.name;
        if (!name) return;
        if (root.classList.contains("confirm")) {
          root.classList.remove("confirm");
          if (confirmTimer) clearTimeout(confirmTimer);
          postCommand("kill-proc", name);
          row.label.textContent = "KILLING…";
        } else {
          root.classList.add("confirm");
          row.val.textContent = "SURE?";
          if (confirmTimer) clearTimeout(confirmTimer);
          confirmTimer = setTimeout(() => root.classList.remove("confirm"), 3000);
        }
      });
      return row;
    }

    return {
      update(m: MetricsTick) {
        const procs: ProcReading[] = m.metrics.proc ?? [];
        for (let i = 0; i < procs.length && i < topN; i++) {
          const p = procs[i];
          const row = ensureRow(i);
          row.label.dataset.name = p.name.replace(/ x\d+$/, ""); // 剥合并后缀，杀同名全部
          if (!row.root.classList.contains("confirm") && row.label.textContent !== "KILLING…") {
            // 不在 JS 里截断：宽卡显示全名，窄卡由 CSS 省略号接管
            row.label.textContent = p.name;
            row.bar.textContent = bar(p.cpu / 100);
            row.val.textContent = `${p.cpu.toFixed(1)}%  ${fmtBytes(p.mem_b, 1)}`;
          }
        }
        // 进程数减少时隐藏多余行
        for (let i = procs.length; i < rows.length; i++) {
          rows[i].root.style.display = "none";
          rows[i].root.classList.remove("confirm");
        }
        for (let i = 0; i < Math.min(procs.length, topN); i++) rows[i].root.style.display = "";
      },
    };
  },
});
