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
  /** 每个扫描点从采集时刻起完全消失的时长。 */
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
  private sweepTimes: number[] | null = null;
  private previousSweep: number[][] | null = null;
  private previousSweepTimes: number[] | null = null;
  private sweepCursor = 0;

  constructor(canvas: HTMLCanvasElement, opts: ScopeOptions) {
    this.canvas = canvas;
    this.opts = opts;
    this.history = Array.from({ length: opts.channels }, () => []);
    if (opts.oscilloscope) {
      this.sweep = Array.from({ length: opts.channels }, () => Array(opts.capacity ?? 120).fill(Number.NaN));
      this.sweepTimes = Array(opts.capacity ?? 120).fill(Number.NEGATIVE_INFINITY);
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
    this.sweepTimes = null;
    this.previousSweep = null;
    this.previousSweepTimes = null;
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
    if (!this.sweep || !this.sweepTimes) return;
    // 当前束扫完最右端后，下一拍才回到左端；每个点保留自己的采样时间。
    if (this.sweepCursor >= this.capacity) {
      this.previousSweep = this.sweep.map((channel) => [...channel]);
      this.previousSweepTimes = [...this.sweepTimes];
      this.sweep = Array.from({ length: this.opts.channels }, () => Array(this.capacity).fill(Number.NaN));
      this.sweepTimes = Array(this.capacity).fill(Number.NEGATIVE_INFINITY);
      this.sweepCursor = 0;
    }
    for (let i = 0; i < this.sweep.length; i++) this.sweep[i][this.sweepCursor] = values[i] ?? 0;
    this.sweepTimes[this.sweepCursor] = performance.now();
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

    if (this.opts.oscilloscope && this.sweep && this.sweepTimes) {
      if (this.previousSweep && this.previousSweepTimes)
        this.drawSweep(this.previousSweep, this.previousSweepTimes, max, w, h, phos, dim);
      this.drawSweep(this.sweep, this.sweepTimes, max, w, h, phos, dim);
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
      ctx.lineWidth = isPrimary ? (this.opts.oscilloscope ? 3 : 2) : (this.opts.oscilloscope ? 1.6 : 1);
      ctx.shadowColor = phos;
      ctx.shadowBlur = isPrimary ? 8 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  private drawSweep(frame: number[][], times: number[], max: number, w: number, h: number, phos: string, dim: string): void {
    const { ctx } = this;
    const stepX = w / (this.capacity - 1);
    const now = performance.now();
    const lifetime = this.opts.persistenceMs ?? 1_000;
    const alphaAt = (at: number) => Math.max(0, 1 - (now - at) / lifetime);
    frame.forEach((ch, ci) => {
      const isPrimary = ci === frame.length - 1 || frame.length === 1;
      ctx.strokeStyle = isPrimary ? phos : dim;
      ctx.lineWidth = isPrimary ? 3 : 1.6;
      ctx.shadowColor = phos;
      ctx.shadowBlur = isPrimary ? 8 : 0;
      for (let i = 1; i < ch.length; i++) {
        const before = ch[i - 1];
        const current = ch[i];
        const fade = Math.min(alphaAt(times[i - 1]), alphaAt(times[i]));
        if (!Number.isFinite(before) || !Number.isFinite(current) || fade <= 0) continue;
        const x0 = (i - 1) * stepX;
        const y0 = h - Math.min(1, Math.max(0, before / max)) * (h - 4) - 2;
        const x1 = i * stepX;
        const y1 = h - Math.min(1, Math.max(0, current / max)) * (h - 4) - 2;
        ctx.globalAlpha = fade * (isPrimary ? 1 : 0.58);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;
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
