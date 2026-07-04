// World coordinates are in cell units: cell (i, j) spans [i, i+1) × [j, j+1).
// The camera holds a world-space center and a scale (screen px per cell).

export class Camera {
  constructor() {
    this.x = 0.5;
    this.y = 0.5;
    this.scale = 42;
    this.viewW = 1;
    this.viewH = 1;
    this.minScale = 2.5;
    this.maxScale = 180;
  }

  worldToScreen(wx, wy) {
    return [
      (wx - this.x) * this.scale + this.viewW / 2,
      (wy - this.y) * this.scale + this.viewH / 2,
    ];
  }

  screenToWorld(sx, sy) {
    return [
      (sx - this.viewW / 2) / this.scale + this.x,
      (sy - this.viewH / 2) / this.scale + this.y,
    ];
  }

  panPixels(dx, dy) {
    this.x -= dx / this.scale;
    this.y -= dy / this.scale;
  }

  /** Zoom keeping the world point under (sx, sy) fixed on screen. */
  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.scale = Math.min(this.maxScale, Math.max(this.minScale, this.scale * factor));
    this.x = wx - (sx - this.viewW / 2) / this.scale;
    this.y = wy - (sy - this.viewH / 2) / this.scale;
  }

  /** Exponential glide toward a target center - frame-rate independent. */
  glideTo(tx, ty, dt, k = 5) {
    const f = 1 - Math.exp(-k * dt);
    this.x += (tx - this.x) * f;
    this.y += (ty - this.y) * f;
  }

  jumpTo(tx, ty) {
    this.x = tx;
    this.y = ty;
  }

  /** Inclusive cell-index bounds of the visible region. */
  visibleCellBounds() {
    const [wx0, wy0] = this.screenToWorld(0, 0);
    const [wx1, wy1] = this.screenToWorld(this.viewW, this.viewH);
    return {
      x0: Math.floor(wx0),
      y0: Math.floor(wy0),
      x1: Math.floor(wx1),
      y1: Math.floor(wy1),
    };
  }
}
