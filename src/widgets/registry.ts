import type { MetricsTick } from "../lib/types";

export interface Widget {
  update(m: MetricsTick): void;
  /** 页面重挂载/移除时清理（取消订阅等），可选 */
  destroy?(): void;
}

export interface WidgetDef {
  id: string;
  title: string;
  /** grid-column span（自由布局下仅作默认尺寸参考） */
  span?: number;
  /** 由 plugins/*.js 注册的卡片（管理器中显示"插件"标记） */
  plugin?: boolean;
  create(host: HTMLElement): Widget;
}

const defs: WidgetDef[] = [];

/** 新面板 = 写一个模块 + 在 main.ts import 侧注册进布局。 */
export function registerWidget(def: WidgetDef): void {
  if (defs.some((d) => d.id === def.id)) throw new Error(`duplicate widget: ${def.id}`);
  defs.push(def);
}

/** 插件（plugins/*.js）可用的全局注册入口，自动打插件标记。 */
(globalThis as Record<string, unknown>).CRT = {
  registerWidget: (def: WidgetDef) => registerWidget({ ...def, plugin: true }),
};

/* ---------- 卡片参数（config.json cardconf）---------- */

let CARD_CONF: Record<string, Record<string, unknown>> = {};

export function setCardConf(conf: Record<string, Record<string, unknown>> | null | undefined): void {
  CARD_CONF = conf ?? {};
}

/** 卡片内读取自己的参数（带默认值），如 conf<{count:number}>("proc", {count:8}).count */
export function conf<T extends object>(id: string, defaults: T): T {
  return { ...defaults, ...(CARD_CONF[id] ?? {}) } as T;
}

export function registeredWidgets(): readonly WidgetDef[] {
  return defs;
}

/** 公共小工具 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function fmtBytes(b: number, digits = 1): string {
  if (!Number.isFinite(b)) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i <= 1 ? 0 : digits)} ${units[i]}`;
}

export function fmtRate(bps: number | null): string {
  if (bps === null) return "—";
  const s = fmtBytes(bps);
  return s.replace(/^(\S+)/, "$1/s").replace("B/s", "B/s");
}

export function bar(ratio: number): string {
  const cells = 24;
  const filled = Math.round(Math.min(1, Math.max(0, ratio)) * cells);
  return "█".repeat(filled) + "░".repeat(cells - filled);
}
