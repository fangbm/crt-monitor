import type { HistoryMsg } from "./types";

/** 历史数据低频推送的共享缓存：hist24 / stats widget 订阅。 */

let latest: HistoryMsg | null = null;
const subs = new Set<() => void>();

export function setHistory(h: HistoryMsg): void {
  latest = h;
  for (const f of subs) f();
}

export function getHistory(): HistoryMsg | null {
  return latest;
}

export function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => subs.delete(fn);
}
