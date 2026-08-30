import { Scope } from "../lib/chart";
import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

registerWidget({
  id: "cpu",
  title: "CPU",
  span: 3,
  create(host: HTMLElement): Widget {
    host.append(
      el("div", "w-head", "CPU"),
      el("div", "w-big", "0.0%"),
    );
    const canvas = el("canvas", "w-canvas");
    host.append(canvas);
    const legend = el("div", "w-legend");
    host.append(legend);

    let scope: Scope | null = null;
    let legendBuilt = false;

    return {
      update(m: MetricsTick) {
        const { cpu } = m.metrics;
        const big = host.querySelector(".w-big") as HTMLElement;
        const freq = cpu.freq_mhz ? ` @ ${(cpu.freq_mhz / 1000).toFixed(2)}GHz` : "";
        big.textContent = `${cpu.usage.toFixed(1)}%${freq}`;

        if (!legendBuilt && m.host.core_count > 0) {
          legendBuilt = true;
          legend.textContent = `${m.host.core_count} cores`;
        }

        if (!scope) {
          // 每核一条暗线 + 总占用一条亮线
          scope = new Scope(canvas, { channels: cpu.cores.length + 1, fixedMax: 100 });
        }
        scope.push([...cpu.cores, cpu.usage]);
      },
      destroy() {
        scope?.dispose();
      },
    };
  },
});
