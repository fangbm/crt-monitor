/** 滚动示波器：多通道折线 + 网格，CPU / 网络曲线共用。 */

export interface ScopeOptions {
  channels: number;
  /** 每通道独立缩放（网络上下行）还是共用 0-100（CPU 占用） */
  fixedMax?: number;
  capacity?: number;
  /** 经典示波器刻度盘：10×8 主网格、细分线和右端扫描点。 */
  oscilloscope?: boolean;
  /** 保留最近 N 帧波形，绘出短暂磷光余辉。 */
  persistence?: number;
  /** 单轮扫描余辉从亮到暗完全消失的时长。 */
  persistenceMs?: number;
  /** 在最新曲线的右端绘制电子束亮点。 */
  beam?: boolean;
}

export class Scope {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private history: number[][];
  private opts: ScopeOptions;
  private resizeObserver?: ResizeObserver;
  private frames: number[][][] = [];
  private sweep: number[][] | null = null;
  private previousSweep: number[][] | null = null;
  private previousSweepAt = 0;
  private sweepCursor = 0;

  constructor(canvas: HTMLCanvasElement, opts: ScopeOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.history = Array.from({ length: opts.channels }, () => []);
    if (opts.oscilloscope) {
      this.sweep = Array.from({ length: opts.channels }, () => Array(opts.capacity ?? 120).fill(Number.NaN));
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    this.ctx = ctx;
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.frames = [];
    this.sweep = null;
    this.previousSweep = null;
    this.previousSweepAt = 0;
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
    if (this.sweep) this.pushSweep(values);
    if (this.opts.persistence && !this.opts.oscilloscope) {
      this.frames.push(this.history.map((channel) => [...channel]));
      while (this.frames.length > this.opts.persistence + 1) this.frames.shift();
    }
    this.draw();
  }

  private pushSweep(values: number[]): void {
    if (!this.sweep) return;
    // 当前束扫完最右端后，下一拍才回到左端；上一整轮留作唯一余辉。
    if (this.sweepCursor >= this.capacity) {
      this.previousSweep = this.sweep.map((channel) => [...channel]);
      this.previousSweepAt = performance.now();
      this.sweep = Array.from({ length: this.opts.channels }, () => Array(this.capacity).fill(Number.NaN));
      this.sweepCursor = 0;
    }
    for (let i = 0; i < this.sweep.length; i++) this.sweep[i][this.sweepCursor] = values[i] ?? 0;
    this.sweepCursor++;
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
    this.drawGrid(w, h, dim, faint);

    const n = this.capacity;
    let max = this.opts.fixedMax ?? 0;
    if (!this.opts.fixedMax) {
      for (const ch of this.history) for (const v of ch) if (v > max) max = v;
      if (max <= 0) max = 1;
      max *= 1.15;
    }

    if (this.opts.oscilloscope && this.sweep) {
      if (this.previousSweep) {
        const lifetime = this.opts.persistenceMs ?? 1_000;
        const fade = Math.max(0, 1 - (performance.now() - this.previousSweepAt) / lifetime);
        if (fade > 0) {
          ctx.globalAlpha = 0.28 * fade * fade;
          this.drawSweep(this.previousSweep, max, w, h, phos, dim);
        }
      }
      ctx.globalAlpha = 1;
      this.drawSweep(this.sweep, max, w, h, phos, dim);
      if (this.opts.beam) this.drawSweepBeam(this.sweep, max, w, h, phos);
      return;
    }

    const frames = this.opts.persistence && this.frames.length > 0 ? this.frames : [this.history];
    frames.forEach((frame, index) => {
      ctx.globalAlpha = index === frames.length - 1 ? 1 : 0.08 + (index / frames.length) * 0.28;
      this.drawChannels(frame, n, max, w, h, phos, dim);
    });
    ctx.globalAlpha = 1;
    if (this.opts.beam) this.drawBeam(frames[frames.length - 1], max, w, h, phos);
  }

  private drawGrid(w: number, h: number, dim: string, faint: string): void {
    const { ctx } = this;
    if (this.opts.oscilloscope) {
      ctx.strokeStyle = faint;
      ctx.globalAlpha = 0.42;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 50; i++) if (i % 5 !== 0) {
        const x = Math.round((w * i) / 50) + 0.5;
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      }
      for (let i = 1; i < 40; i++) if (i % 5 !== 0) {
        const y = Math.round((h * i) / 40) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.strokeStyle = dim;
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 10; i++) {
        const x = Math.round((w * i) / 10) + 0.5;
        ctx.moveTo(x, 0); ctx.lineTo(x, h);
      }
      for (let i = 0; i <= 8; i++) {
        const y = Math.round((h * i) / 8) + 0.5;
        ctx.moveTo(0, y); ctx.lineTo(w, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    ctx.strokeStyle = faint;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 8; i++) {
      const x = Math.round((w * i) / 8) + 0.5;
      ctx.moveTo(x, 0); ctx.lineTo(x, h);
    }
    for (let i = 1; i < 4; i++) {
      const y = Math.round((h * i) / 4) + 0.5;
      ctx.moveTo(0, y); ctx.lineTo(w, y);
    }
    ctx.stroke();
  }

  private drawChannels(frame: number[][], n: number, max: number, w: number, h: number, phos: string, dim: string): void {
    const { ctx } = this;
    const stepX = w / (n - 1);
    frame.forEach((ch, ci) => {
      const isPrimary = ci === frame.length - 1 || frame.length === 1;
      ctx.beginPath();
      for (let i = 0; i < ch.length; i++) {
        const x = w - (ch.length - 1 - i) * stepX;
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

  private drawSweep(frame: number[][], max: number, w: number, h: number, phos: string, dim: string): void {
    const { ctx } = this;
    const stepX = w / (this.capacity - 1);
    frame.forEach((ch, ci) => {
      const isPrimary = ci === frame.length - 1 || frame.length === 1;
      let drawing = false;
      ctx.beginPath();
      for (let i = 0; i < ch.length; i++) {
        const value = ch[i];
        if (!Number.isFinite(value)) {
          drawing = false;
          continue;
        }
        const x = i * stepX;
        const y = h - Math.min(1, Math.max(0, value / max)) * (h - 4) - 2;
        if (!drawing) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        drawing = true;
      }
      ctx.strokeStyle = isPrimary ? phos : dim;
      ctx.lineWidth = isPrimary ? 2 : 1;
      ctx.shadowColor = phos;
      ctx.shadowBlur = isPrimary ? 8 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  private drawBeam(frame: number[][], max: number, w: number, h: number, phos: string): void {
    const values = frame[frame.length - 1];
    const latest = values?.[values.length - 1];
    if (latest === undefined) return;
    const x = Math.max(4, w - 4);
    const y = h - Math.min(1, Math.max(0, latest / max)) * (h - 4) - 2;
    const { ctx } = this;
    ctx.fillStyle = phos;
    ctx.shadowColor = phos;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  private drawSweepBeam(frame: number[][], max: number, w: number, h: number, phos: string): void {
    const values = frame[frame.length - 1];
    const index = Math.max(0, this.sweepCursor - 1);
    const latest = values?.[index];
    if (latest === undefined || !Number.isFinite(latest)) return;
    const x = Math.min(w - 4, Math.max(4, (index * w) / (this.capacity - 1)));
    const y = h - Math.min(1, Math.max(0, latest / max)) * (h - 4) - 2;
    const { ctx } = this;
    ctx.fillStyle = phos;
    ctx.shadowColor = phos;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}
