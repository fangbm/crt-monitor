export interface ThemeEffects {
  scanline?: number;
  flicker?: boolean;
  vignette?: number;
  curvature?: boolean;
}

export interface Theme {
  id: string;
  name: string;
  vars: Record<string, string>;
  /** 主题自带特效（可选）：切换时覆盖全局 effects，切走还原 */
  effects?: ThemeEffects | null;
}

/** 内建兜底主题（浏览器 mock / themes 目录缺失时用）；运行时以壳下发的主题目录为准。 */
const BUILTIN: Theme[] = [
  {
    id: "green",
    name: "P1 Phosphor",
    vars: {
      "--phos": "#3dff7c",
      "--phos-bright": "#c8ffd9",
      "--phos-dim": "#0e5a28",
      "--phos-faint": "#07331a",
      "--bg": "#030905",
    },
  },
  {
    id: "amber",
    name: "Amber",
    vars: {
      "--phos": "#ffb32b",
      "--phos-bright": "#ffe6b0",
      "--phos-dim": "#7a4d0a",
      "--phos-faint": "#3d2705",
      "--bg": "#0a0602",
    },
  },
  {
    id: "white",
    name: "Paper White",
    vars: {
      "--phos": "#d7e2e8",
      "--phos-bright": "#ffffff",
      "--phos-dim": "#4a5a63",
      "--phos-faint": "#232d33",
      "--bg": "#05080a",
    },
  },
  {
    id: "scope",
    name: "CRT Oscilloscope",
    vars: {
      "--phos": "#61ff9b",
      "--phos-bright": "#ddffe9",
      "--phos-dim": "#12613a",
      "--phos-faint": "#082c1b",
      "--bg": "#010704",
      "--glow": "92%",
      "--radius": "0px",
    },
    effects: { scanline: 0.48, flicker: true, vignette: 0.72, curvature: true },
  },
];

let catalog: Theme[] = BUILTIN;

/** 全局特效默认值（来自 config），无自带特效的主题回落到这里 */
let defaultEffects: ThemeEffects = { scanline: 0.35, flicker: true, vignette: 0.55, curvature: true };

export function setDefaultEffects(fx: ThemeEffects | null | undefined): void {
  if (fx) defaultEffects = fx;
}

function applyEffectValues(fx: ThemeEffects): void {
  const root = document.documentElement;
  root.style.setProperty("--scan", String(fx.scanline ?? 0.35));
  root.style.setProperty("--vig", String(fx.vignette ?? 0.55));
  document.body.classList.toggle("no-flicker", fx.flicker === false);
  document.body.classList.toggle("curved", fx.curvature !== false);
}

/** 壳下发的 themes/*.json 合并进来（同 id 覆盖内建，新 id 追加）。 */
export function setThemeCatalog(themes: Theme[]): void {
  const byId = new Map(BUILTIN.map((t) => [t.id, t]));
  for (const t of themes) if (t?.id && t.vars) byId.set(t.id, t);
  catalog = [...byId.values()];
}

export function themeIds(): string[] {
  return catalog.map((t) => t.id);
}

/** 主题清单（卡片管理器的 THEMES 区展示用）。 */
export function themeList(): Array<{ id: string; name: string }> {
  return catalog.map((t) => ({ id: t.id, name: t.name ?? t.id }));
}

export function applyTheme(id: string): void {
  const theme = catalog.find((t) => t.id === id) ?? catalog[0];
  const root = document.documentElement;
  // 清掉上一套主题的可选变量（--glow/--radius），避免残留到下一套
  root.style.removeProperty("--glow");
  root.style.removeProperty("--radius");
  for (const [k, v] of Object.entries(theme.vars)) {
    root.style.setProperty(k, v);
  }
  applyEffectValues(theme.effects ?? defaultEffects);
}
