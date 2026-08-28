import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

/** 磁盘活动指示灯：每盘两颗 LED（R/W），有 IO 时点亮。服务器机箱灯风格。 */

interface Led {
  root: HTMLElement;
  r: HTMLElement;
  w: HTMLElement;
}

registerWidget({
  id: "leds",
  title: "DISK LED",
  span: 1,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "DISK ACT"));
    const list = el("div", "led-list");
    host.append(list);
    const leds = new Map<string, Led>();

    return {
      update(m: MetricsTick) {
        const seen = new Set<string>();
        for (const d of m.metrics.disks) {
          seen.add(d.mount);
          let led = leds.get(d.mount);
          if (!led) {
            const root = el("div", "led-row");
            const label = el("span", "led-label", d.mount);
            const pair = el("span", "led-pair");
            const r = el("span", "led r");
            const w = el("span", "led w");
            pair.append(r, w);
            root.append(label, pair);
            list.append(root);
            led = { root, r, w };
            leds.set(d.mount, led);
          }
          const rOn = (d.read_bps ?? 0) > 1024;
          const wOn = (d.write_bps ?? 0) > 1024;
          led.r.classList.toggle("on", rOn);
          led.w.classList.toggle("on", wOn);
        }
        for (const [mount, led] of leds) {
          if (!seen.has(mount)) led.root.remove(), leds.delete(mount);
        }
      },
    };
  },
});
