import { el, registerWidget, type Widget } from "./registry";
import { postCommand } from "../lib/transport";
import type { MetricsTick } from "../lib/types";

const STATE_CN: Record<string, string> = {
  playing: "▶ PLAYING",
  paused: "⏸ PAUSED",
  stopped: "■ STOPPED",
};

/** 正在播放：Windows 媒体会话（标题/艺术家/进度）。滚轮调系统音量。 */
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
    const vol = el("div", "md-vol");
    host.append(title, artist, bar, time, vol);

    // 滚轮 ±5 音量（节流 150ms）
    let lastVol = 0;
    let lastAt = 0;
    host.addEventListener("wheel", (e) => {
      e.preventDefault();
      const now = Date.now();
      if (now - lastAt < 150) return;
      lastAt = now;
      const target = Math.max(0, Math.min(100, lastVol + (e.deltaY < 0 ? 5 : -5)));
      postCommand("set-volume", target);
    }, { passive: false });

    return {
      update(m: MetricsTick) {
        const md = m.metrics.media;
        lastVol = md?.volume ?? 0;
        const volText = `VOL ${md?.muted ? "MUTE" : (md?.volume ?? 0) + "%"}`;
        if (vol.textContent !== volText) vol.textContent = volText;
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
