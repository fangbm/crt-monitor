/** 滚动示波器：多通道折线 + 网格，CPU / 网络曲线共用。 */

export interface ScopeOptions {
  channels: number;
  /** 每通道独立缩放（网络上下行）还是共用 0-100（CPU 占用） */
  fixedMax?: number;
  capacity?: number;
}

export class Scope {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private history: number[][];
  private opts: ScopeOptions;

  constructor(canvas: HTMLCanvasElement, opts: ScopeOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.history = Array.from({ length: opts.channels }, () => []);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.resize()).observe(canvas);
    }
  }

  get capacity(): number {
    return this.opts.capacity ?? 120;
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
  }

  push(values: number[]): void {
    for (let i = 0; i < this.history.length; i++) {
      const v = values[i] ?? 0;
      this.history[i].push(v);
      if (this.history[i].length > this.capacity) this.history[i].shift();
    }
    this.draw();
  }

  private css(name: string): string {
    return getComputedStyle(this.canvas).getPropertyValue(name).trim() || "#3dff7c";
  }

  draw(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const phos = this.css("--phos");
    const dim = this.css("--phos-dim");
    const faint = this.css("--phos-faint");
    ctx.clearRect(0, 0, w, h);

    // grid: 4x8 cells
    ctx.strokeStyle = faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = Math.round((w * i) / 8) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let i = 1; i < 4; i++) {
      const y = Math.round((h * i) / 4) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    const n = this.capacity;
    let max = this.opts.fixedMax ?? 0;
    if (!this.opts.fixedMax) {
      for (const ch of this.history) for (const v of ch) if (v > max) max = v;
      if (max <= 0) max = 1;
      max *= 1.15;
    }

    const stepX = w / (n - 1);
    this.history.forEach((ch, ci) => {
      const isPrimary = ci === this.history.length - 1 || this.history.length === 1;
      ctx.beginPath();
      const len = ch.length;
      for (let i = 0; i < len; i++) {
        const x = w - (len - 1 - i) * stepX;
        const y = h - Math.min(1, Math.max(0, ch[i] / max)) * (h - 4) - 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = isPrimary ? phos : dim;
      ctx.lineWidth = isPrimary ? 2 : 1;
      ctx.shadowColor = phos;
      ctx.shadowBlur = isPrimary ? 8 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }
}
