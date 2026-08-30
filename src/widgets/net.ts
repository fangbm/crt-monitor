import { Scope } from "../lib/chart";
import { el, fmtRate, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

registerWidget({
  id: "net",
  title: "NET",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "NETWORK"));
    const canvas = el("canvas", "w-canvas");
    host.append(canvas);
    const readout = el("div", "w-readout");
    const rx = el("span", "", "RX ─");
    const tx = el("span", "", "TX ─");
    readout.append(rx, tx);
    host.append(readout);

    const scope = new Scope(canvas, { channels: 2 });

    return {
      update(m: MetricsTick) {
        const { rx_bps, tx_bps } = m.metrics.net;
        scope.push([rx_bps, tx_bps]);
        rx.textContent = `RX ${fmtRate(rx_bps).padStart(10, " ")}`;
        tx.textContent = `TX ${fmtRate(tx_bps).padStart(10, " ")}`;
      },
      destroy() {
        scope.dispose();
      },
    };
  },
});
