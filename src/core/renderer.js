// Canvas 2D renderer. Draws the infinite checkerboard and coordinate grid,
// then runs registered paint passes (games contribute their own). Only the
// visible region is ever touched: the checkerboard is a single pattern fill,
// grid lines are computed from the visible cell bounds, and passes are given
// the camera to cull against.

const BG = '#0b0e14';
const CHECKER_A = '#0e1219';
const CHECKER_B = '#121722';

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.ctx = canvas.getContext('2d');
    this.dpr = 1;
    this.passes = [];
    this.gridEnabled = () => true;
    this._pattern = null;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
      this._pattern = null; // context reset invalidates the pattern
    }
    this.dpr = dpr;
    this.camera.viewW = w;
    this.camera.viewH = h;
  }

  frame(now) {
    this.resize();
    const { ctx, camera: cam } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBoard(ctx, cam);
    if (this.gridEnabled()) this.drawGrid(ctx, cam);
    for (const pass of this.passes) pass(ctx, cam, now);
  }

  drawBoard(ctx, cam) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
    const cell = cam.scale;
    if (cell < 4) return; // cells subpixel-ish: flat background reads better

    if (!this._pattern) {
      // 2×2-cell tile at a fixed 32px base; scaled into place via
      // pattern.setTransform so the lattice stays exactly aligned.
      const tile = document.createElement('canvas');
      tile.width = tile.height = 64;
      const g = tile.getContext('2d');
      g.fillStyle = CHECKER_A;
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = CHECKER_B;
      g.fillRect(0, 0, 32, 32);
      g.fillRect(32, 32, 32, 32);
      this._pattern = ctx.createPattern(tile, 'repeat');
    }
    const [ox, oy] = cam.worldToScreen(0, 0);
    const m = new DOMMatrix();
    m.translateSelf(ox, oy);
    m.scaleSelf(cell / 32);
    this._pattern.setTransform(m);
    ctx.fillStyle = this._pattern;
    ctx.fillRect(0, 0, cam.viewW, cam.viewH);
  }

  drawGrid(ctx, cam) {
    const cell = cam.scale;
    const b = cam.visibleCellBounds();
    const step = niceStep(56 / cell); // major-line spacing in cells

    // Minor lines: every cell, only when cells are big enough to matter.
    if (cell >= 9) {
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = b.x0; gx <= b.x1 + 1; gx++) {
        if (gx % step === 0) continue;
        const [sx] = cam.worldToScreen(gx, 0);
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, cam.viewH);
      }
      for (let gy = b.y0; gy <= b.y1 + 1; gy++) {
        if (gy % step === 0) continue;
        const [, sy] = cam.worldToScreen(0, gy);
        ctx.moveTo(0, sy);
        ctx.lineTo(cam.viewW, sy);
      }
      ctx.stroke();
    }

    // Major lines.
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.11)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gx0 = Math.ceil(b.x0 / step) * step;
    const gy0 = Math.ceil(b.y0 / step) * step;
    for (let gx = gx0; gx <= b.x1 + 1; gx += step) {
      if (gx === 0) continue;
      const [sx] = cam.worldToScreen(gx, 0);
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, cam.viewH);
    }
    for (let gy = gy0; gy <= b.y1 + 1; gy += step) {
      if (gy === 0) continue;
      const [, sy] = cam.worldToScreen(0, gy);
      ctx.moveTo(0, sy);
      ctx.lineTo(cam.viewW, sy);
    }
    ctx.stroke();

    // Axes through the origin.
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.22)';
    ctx.beginPath();
    const [ax] = cam.worldToScreen(0, 0);
    const [, ay] = cam.worldToScreen(0, 0);
    if (ax >= 0 && ax <= cam.viewW) {
      ctx.moveTo(ax, 0);
      ctx.lineTo(ax, cam.viewH);
    }
    if (ay >= 0 && ay <= cam.viewH) {
      ctx.moveTo(0, ay);
      ctx.lineTo(cam.viewW, ay);
    }
    ctx.stroke();

    // Coordinate labels along the edges at major lines.
    if (cell * step >= 40) {
      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(203, 213, 225, 0.4)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let gx = gx0; gx <= b.x1 + 1; gx += step) {
        const [sx] = cam.worldToScreen(gx, 0);
        ctx.fillText(String(gx), sx + 3, 4);
      }
      for (let gy = gy0; gy <= b.y1 + 1; gy += step) {
        const [, sy] = cam.worldToScreen(0, gy);
        ctx.fillText(String(gy), 4, sy + 3);
      }
    }
  }
}

/** Smallest "nice" step (1, 2, 5, 10, 20, 50, ...) that is >= raw. */
function niceStep(raw) {
  if (raw <= 1) return 1;
  let mag = 1;
  for (;;) {
    for (const m of [1, 2, 5]) {
      if (m * mag >= raw) return m * mag;
    }
    mag *= 10;
  }
}
