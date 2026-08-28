import { el, registerWidget, type Widget } from "./registry";
import type { MetricsTick } from "../lib/types";

const STATE_CN: Record<string, string> = {
  playing: "▶ PLAYING",
  paused: "⏸ PAUSED",
  stopped: "■ STOPPED",
};

/** 正在播放：Windows 媒体会话（标题/艺术家/进度）。 */
registerWidget({
  id: "media",
  title: "MEDIA",
  span: 2,
  create(host: HTMLElement): Widget {
    host.append(el("div", "w-head", "NOW PLAYING"));
    const title = el("div", "md-title", "—");
    const artist = el("div", "md-artist", "");
    const bar = el("div", "md-bar");
    const time = el("div", "md-time", "");
    host.append(title, artist, bar, time);

    return {
      update(m: MetricsTick) {
        const md = m.metrics.media;
        if (!md || !md.title) {
          title.textContent = "NOTHING";
          artist.textContent = "";
          bar.textContent = "";
          time.textContent = "";
          return;
        }
        title.textContent = md.title.length > 34 ? md.title.slice(0, 33) + "…" : md.title;
        artist.textContent = md.artist;
        const pct = md.dur_sec > 0 ? Math.min(1, md.pos_sec / md.dur_sec) : 0;
        bar.textContent = barFn(pct, 30);
        const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
        time.textContent = `${STATE_CN[md.status] ?? ""}  ${fmt(md.pos_sec)} / ${fmt(md.dur_sec)}`;
      },
    };
  },
});

function barFn(ratio: number, cells: number): string {
  const filled = Math.round(ratio * cells);
  return "█".repeat(filled) + "░".repeat(cells - filled);
}
