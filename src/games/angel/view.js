// The Angel Problem's paint pass and animation state: block fade-ins, angel
// glide, invalid-click flashes, and all overlays. Draws only what intersects
// the visible cell bounds; when the blocked set outgrows the viewport it
// switches from iterating cells to scanning the visible range.

import { pack, unpackX, unpackY } from '../../core/grid.js';
import * as rules from './rules.js';
import { computeFrontier, computeTerritory, computeTrail } from './overlays.js';

const BLOCK_FILL = '#8e2f23';
const BLOCK_FADE_MS = 360;

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class AngelView {
  constructor(app) {
    this.app = app;
    this.game = null;
    this.unsub = null;
    this.version = 0;
    this.spawn = new Map(); // packed key -> block fade-in start time
    this.tween = null; // angel glide animation
    this.flash = null; // invalid click feedback
    this._legal = null;
    this._legalV = -1;
    this._frontier = null;
    this._frontierV = -1;
    this._territory = null;
    this._territoryV = -1;
    this._trail = null;
    this._trailV = -1;
    app.renderer.passes.push((ctx, cam, now) => this.paint(ctx, cam, now));
  }

  attach(game) {
    if (this.unsub) this.unsub();
    this.game = game;
    this.unsub = game.onEvent((ev) => this.onEvent(ev));
    this.spawn.clear();
    this.tween = null;
    this.flash = null;
    this.version++;
  }

  onEvent(ev) {
    this.version++;
    const now = performance.now();
    if (ev.t === 'b') {
      this.spawn.set(pack(ev.x, ev.y), now);
    } else if (ev.t === 'a') {
      const from = this.angelPos(now);
      this.tween = { fx: from.x, fy: from.y, tx: ev.x, ty: ev.y, t0: now, dur: this.app.animMs() };
    } else if (ev.t === 'undo') {
      const u = ev.undone;
      if (u.t === 'b') {
        this.spawn.delete(pack(u.x, u.y));
      } else {
        const from = this.angelPos(now);
        this.tween = { fx: from.x, fy: from.y, tx: u.fx, ty: u.fy, t0: now, dur: this.app.animMs() };
      }
    }
  }

  /** Animated angel position in cell coordinates (floats mid-glide). */
  angelPos(now) {
    const a = this.game.state.angel;
    const tw = this.tween;
    if (!tw) return { x: a.x, y: a.y };
    const t = Math.min(1, (now - tw.t0) / tw.dur);
    if (t >= 1) {
      this.tween = null;
      return { x: a.x, y: a.y };
    }
    const e = easeInOutCubic(t);
    return { x: tw.fx + (tw.tx - tw.fx) * e, y: tw.fy + (tw.ty - tw.fy) * e };
  }

  legal() {
    if (this._legalV !== this.version) {
      this._legal = rules.legalAngelMoves(this.game.state);
      this._legalV = this.version;
    }
    return this._legal;
  }

  mobility() {
    return this.legal().length;
  }

  flashCell(cell) {
    this.flash = { x: cell.x, y: cell.y, t0: performance.now() };
  }

  // ------------------------------------------------------------- painting

  paint(ctx, cam, now) {
    if (!this.game) return;
    const st = this.game.state;
    const opts = this.app.options;
    const cell = cam.scale;
    const b = cam.visibleCellBounds();
    const visArea = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    const inView = (x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

    if (opts.territory) this.paintTerritory(ctx, cam, st, b, visArea);
    if (opts.heatmap) this.paintHeatmap(ctx, cam, st, b, now);
    if (opts.frontier) this.paintFrontier(ctx, cam, st, inView);
    if (opts.trail) this.paintTrail(ctx, cam, st, now);
    if (opts.legal && !st.result) this.paintLegal(ctx, cam, st, inView);
    this.paintBlocked(ctx, cam, st, b, visArea, now);
    this.paintFlash(ctx, cam, now);
    this.paintAngel(ctx, cam, now);
    this.paintHover(ctx, cam, st);
  }

  paintTerritory(ctx, cam, st, b, visArea) {
    if (this._territoryV !== this.version) {
      this._territory = computeTerritory(st);
      this._territoryV = this.version;
    }
    const terr = this._territory;
    ctx.fillStyle = 'rgba(190, 78, 60, 0.09)';
    const draw = (x, y) => {
      const [sx, sy] = cam.worldToScreen(x, y);
      ctx.fillRect(sx, sy, cam.scale, cam.scale);
    };
    if (terr.size <= visArea * 2) {
      for (const k of terr) {
        if (st.blocked.has(k)) continue;
        const x = unpackX(k);
        const y = unpackY(k);
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) draw(x, y);
      }
    } else {
      for (let x = b.x0; x <= b.x1; x++) {
        for (let y = b.y0; y <= b.y1; y++) {
          const k = pack(x, y);
          if (terr.has(k) && !st.blocked.has(k)) draw(x, y);
        }
      }
    }
  }

  paintHeatmap(ctx, cam, st, b, now) {
    // Chebyshev iso-lines are concentric squares: stack translucent squares
    // from the largest visible radius inward and the alpha accumulates into
    // a smooth distance gradient centered on the (animated) angel.
    const ap = this.angelPos(now);
    const rMax = Math.ceil(
      Math.max(
        Math.abs(b.x0 - ap.x),
        Math.abs(b.x1 - ap.x),
        Math.abs(b.y0 - ap.y),
        Math.abs(b.y1 - ap.y)
      )
    );
    if (rMax > 400 || rMax < 1) return;
    const layerAlpha = 1 - Math.pow(0.7, 1 / rMax); // center coverage ~0.3
    ctx.fillStyle = '#8b5cf6';
    ctx.globalAlpha = layerAlpha;
    for (let r = rMax; r >= 0; r--) {
      const [sx, sy] = cam.worldToScreen(ap.x - r, ap.y - r);
      const size = (2 * r + 1) * cam.scale;
      ctx.fillRect(sx, sy, size, size);
    }
    ctx.globalAlpha = 1;
  }

  paintFrontier(ctx, cam, st, inView) {
    if (this._frontierV !== this.version) {
      this._frontier = computeFrontier(st, 3);
      this._frontierV = this.version;
    }
    const alphas = [0.16, 0.085, 0.045];
    for (const [k, d] of this._frontier) {
      const x = unpackX(k);
      const y = unpackY(k);
      if (!inView(x, y)) continue;
      ctx.fillStyle = `rgba(56, 189, 248, ${alphas[d - 1] ?? 0.03})`;
      const [sx, sy] = cam.worldToScreen(x, y);
      ctx.fillRect(sx, sy, cam.scale, cam.scale);
    }
  }

  paintTrail(ctx, cam, st, now) {
    if (this._trailV !== this.version) {
      this._trail = computeTrail(st);
      this._trailV = this.version;
    }
    const pts = this._trail;
    if (pts.length < 2) return;
    const ap = this.angelPos(now);
    const maxSegs = 240;
    const start = Math.max(0, pts.length - 1 - maxSegs);
    ctx.lineWidth = Math.max(1.5, cam.scale * 0.08);
    ctx.lineCap = 'round';
    const segs = pts.length - 1 - start;
    for (let i = start; i < pts.length - 1; i++) {
      const isLast = i === pts.length - 2;
      const a = pts[i];
      const to = isLast ? ap : pts[i + 1];
      const t = (i - start + 1) / segs; // 0 old -> 1 recent
      ctx.strokeStyle = `rgba(125, 211, 252, ${0.04 + 0.3 * t * t})`;
      const [x0, y0] = cam.worldToScreen(a.x + 0.5, a.y + 0.5);
      const [x1, y1] = cam.worldToScreen(to.x + 0.5, to.y + 0.5);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  paintLegal(ctx, cam, st, inView) {
    const dim = st.ply === 'angel' ? 1 : 0.45;
    const cell = cam.scale;
    for (const m of this.legal()) {
      if (!inView(m.x, m.y)) continue;
      const [sx, sy] = cam.worldToScreen(m.x, m.y);
      if (cell >= 10) {
        const inset = Math.max(1.5, cell * 0.14);
        ctx.strokeStyle = `rgba(125, 211, 252, ${0.4 * dim})`;
        ctx.fillStyle = `rgba(125, 211, 252, ${0.07 * dim})`;
        ctx.lineWidth = 1;
        roundRectPath(ctx, sx + inset, sy + inset, cell - 2 * inset, cell - 2 * inset, cell * 0.12);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgba(125, 211, 252, ${0.35 * dim})`;
        const r = Math.max(1, cell * 0.16);
        ctx.fillRect(sx + cell / 2 - r / 2, sy + cell / 2 - r / 2, r, r);
      }
    }
  }

  paintBlocked(ctx, cam, st, b, visArea, now) {
    const cell = cam.scale;
    const rounded = cell >= 8;
    const drawOne = (x, y, k) => {
      const [sx, sy] = cam.worldToScreen(x, y);
      let t = 1;
      const t0 = this.spawn.get(k);
      if (t0 !== undefined) {
        t = Math.min(1, (now - t0) / BLOCK_FADE_MS);
        if (t >= 1) this.spawn.delete(k);
      }
      ctx.globalAlpha = 0.3 + 0.7 * t;
      ctx.fillStyle = BLOCK_FILL;
      if (rounded) {
        const inset = cell * 0.06;
        roundRectPath(ctx, sx + inset, sy + inset, cell - 2 * inset, cell - 2 * inset, cell * 0.14);
        ctx.fill();
      } else {
        ctx.fillRect(sx, sy, Math.max(1, cell), Math.max(1, cell));
      }
      if (t < 1) {
        ctx.globalAlpha = (1 - t) * 0.8;
        ctx.strokeStyle = '#ff7a5c';
        ctx.lineWidth = Math.max(1, cell * 0.08);
        ctx.strokeRect(sx + 0.5, sy + 0.5, cell - 1, cell - 1);
      }
      ctx.globalAlpha = 1;
    };

    if (st.blocked.size <= visArea * 1.5) {
      for (const k of st.blocked.keys()) {
        const x = unpackX(k);
        const y = unpackY(k);
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) drawOne(x, y, k);
      }
    } else {
      for (let x = b.x0; x <= b.x1; x++) {
        for (let y = b.y0; y <= b.y1; y++) {
          const k = pack(x, y);
          if (st.blocked.has(k)) drawOne(x, y, k);
        }
      }
    }
  }

  paintFlash(ctx, cam, now) {
    if (!this.flash) return;
    const t = (now - this.flash.t0) / 320;
    if (t >= 1) {
      this.flash = null;
      return;
    }
    const [sx, sy] = cam.worldToScreen(this.flash.x, this.flash.y);
    ctx.fillStyle = `rgba(248, 113, 113, ${0.4 * (1 - t)})`;
    ctx.fillRect(sx, sy, cam.scale, cam.scale);
  }

  paintAngel(ctx, cam, now) {
    const ap = this.angelPos(now);
    const [sx, sy] = cam.worldToScreen(ap.x + 0.5, ap.y + 0.5);
    const cell = cam.scale;
    const pulse = 1 + 0.05 * Math.sin(now / 320);
    const r = Math.max(2.5, cell * 0.32) * pulse;

    const glow = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 3.2);
    glow.addColorStop(0, 'rgba(56, 189, 248, 0.30)');
    glow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e0f2fe';
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = Math.max(1, cell * 0.05);
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  paintHover(ctx, cam, st) {
    const hov = this.app.hover;
    if (!hov || st.result || !this.game.currentIsHuman()) return;
    const valid =
      st.ply === 'devil'
        ? rules.canBlock(st, hov.x, hov.y)
        : rules.canMoveTo(st, hov.x, hov.y);
    const color = !valid
      ? 'rgba(148, 163, 184, 0.3)'
      : st.ply === 'devil'
        ? 'rgba(248, 113, 113, 0.85)'
        : 'rgba(125, 211, 252, 0.9)';
    const [sx, sy] = cam.worldToScreen(hov.x, hov.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, cam.scale * 0.07);
    ctx.strokeRect(sx + 1, sy + 1, cam.scale - 2, cam.scale - 2);
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.rect(x, y, w, h);
  }
}
