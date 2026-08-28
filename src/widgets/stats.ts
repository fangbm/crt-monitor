import { el, fmtBytes, fmtRate, registerWidget, type Widget } from "./registry";
import { getHistory, subscribe } from "../lib/historyStore";
import type { MetricsTick } from "../lib/types";

/** 24h 统计：峰值与均值。 */
registerWidget({
  id: "stats",
  title: "STATS",
  span: 5,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "STATS · 24H"));
    const list = el("div", "w-list w-stats");
    host.append(list);

    function render(): void {
      const h = getHistory();
      const s = h?.stats;
      const rows: Array<[string, string]> = [
        ["CPU MAX", s ? `${s.cpu_max}%` : "—"],
        ["CPU AVG", s ? `${s.cpu_avg}%` : "—"],
        ["MEM MAX", s ? `${s.mem_max}%` : "—"],
        ["DOWN MAX", s ? fmtRate(s.rx_max) : "—"],
        ["UP MAX", s ? fmtRate(s.tx_max) : "—"],
        ["TODAY ↓", s && s.today_rx > 0 ? fmtBytes(s.today_rx, 1) : "—"],
        ["TODAY ↑", s && s.today_tx > 0 ? fmtBytes(s.today_tx, 1) : "—"],
        ["SAMPLES", h ? `${h.points.length} min` : "—"],
      ];
      list.textContent = "";
      for (const [label, val] of rows) {
        const row = el("div", "w-row");
        row.append(el("span", "w-label", label));
        row.append(el("span", "w-bar", "·"));
        row.append(el("span", "w-val", val));
        list.append(row);
      }
    }

    const unsubscribe = subscribe(render);
    render();

    return {
      update(_m: MetricsTick) { /* 数据变化由 historyStore 通知 */ },
      destroy() {
        unsubscribe();
      },
    };
  },
});
