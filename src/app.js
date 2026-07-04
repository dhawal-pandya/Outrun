// App shell: owns the render loop, playback (play/pause/step/undo), and
// pointer + keyboard input. Game-specific behavior comes entirely from the
// registered game definition, so hosting a different grid system means
// registering it and swapping the id below.

import { Camera } from './core/camera.js';
import { Renderer } from './core/renderer.js';
import { games } from './engine/registry.js';
import './games/angel/index.js';
import { Panel } from './ui/panel.js';

export class App {
  constructor(root) {
    this.def = games.get('angel');
    this.canvas = root.querySelector('#board');
    this.camera = new Camera();
    this.renderer = new Renderer(this.canvas, this.camera);
    this.options = { legal: true, frontier: false, trail: true, territory: false, heatmap: false, grid: true };
    this.renderer.gridEnabled = () => this.options.grid;
    this.hover = null;
    this.playing = false;
    this.speed = 4; // plies (half-moves) per second
    this.acc = 0;
    this.follow = true;
    this.game = null;
    this.view = this.def.createView(this);
    this.panel = new Panel(this, root);
    this._bindPointer();
    this._bindKeys();
    this.newGame(this.panel.readConfig());
    this._loop();
  }

  /** Angel glide duration, scaled to playback speed so fast sims stay crisp. */
  animMs() {
    return Math.max(70, Math.min(420, (1000 / this.speed) * 0.55));
  }

  newGame(config) {
    this.game = this.def.create(config);
    this.view.attach(this.game);
    this.follow = true;
    this.playing = true;
    this.acc = 0;
    this.camera.jumpTo(0.5, 0.5);
    this.camera.scale = Math.max(16, Math.min(52, 340 / (config.power * 2 + 1)));
    this.panel.hideBanner();
  }

  /** Advance one ply. Returns false when there is nothing to advance. */
  stepOnce() {
    const mv = this.game.stepAI();
    if (this.game.state.result) this.onGameOver();
    return !!mv;
  }

  step() {
    this.playing = false;
    if (this.game.state.result) return;
    if (this.game.currentIsHuman()) {
      this.panel.toast('Human to move: click the board');
      return;
    }
    this.stepOnce();
  }

  togglePlay() {
    if (this.game.state.result) return;
    this.playing = !this.playing;
  }

  undo() {
    this.playing = false;
    this.game.undo();
    this.panel.hideBanner();
  }

  onGameOver() {
    this.playing = false;
    const res = this.game.state.result;
    if (res) this.panel.showBanner(`The Devil traps the Angel after ${res.rounds} rounds`);
  }

  clickCell(cell) {
    if (!cell) return;
    const st = this.game.state;
    if (st.result || !this.game.currentIsHuman()) return;
    const mv = this.def.clickAction(st, cell);
    if (mv) {
      this.game.act(mv);
      if (this.game.state.result) this.onGameOver();
    } else {
      this.view.flashCell(cell);
    }
  }

  update(now, dt) {
    if (this.playing && !this.game.state.result) {
      if (this.game.currentIsHuman()) {
        this.acc = 0; // playback idles while a human decides
      } else {
        this.acc += dt * this.speed;
        let guard = 0;
        while (this.acc >= 1 && guard++ < 24) {
          this.acc -= 1;
          if (!this.stepOnce()) {
            this.acc = 0;
            break;
          }
          if (this.game.currentIsHuman()) break;
        }
      }
    }
    if (this.follow) {
      const p = this.view.angelPos(now);
      this.camera.glideTo(p.x + 0.5, p.y + 0.5, dt);
    }
    this.panel.updateHUD();
  }

  _loop() {
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      this.update(now, dt);
      this.renderer.frame(now);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  _cellAt(e) {
    const rect = this.canvas.getBoundingClientRect();
    const [wx, wy] = this.camera.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  _bindPointer() {
    const cv = this.canvas;
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 1) return;
      cv.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, moved: false };
    });
    cv.addEventListener('pointermove', (e) => {
      this.hover = this._cellAt(e);
      if (drag && e.buttons) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        if (drag.moved || Math.abs(dx) + Math.abs(dy) > 4) {
          drag.moved = true;
          this.camera.panPixels(dx, dy);
          this.follow = false;
          drag.x = e.clientX;
          drag.y = e.clientY;
        }
      }
    });
    cv.addEventListener('pointerup', (e) => {
      if (drag && !drag.moved) this.clickCell(this._cellAt(e));
      drag = null;
    });
    cv.addEventListener('pointerleave', () => {
      this.hover = null;
    });
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = cv.getBoundingClientRect();
        const f = Math.exp(-e.deltaY * 0.0016);
        this.camera.zoomAt(e.clientX - rect.left, e.clientY - rect.top, f);
      },
      { passive: false }
    );
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _bindKeys() {
    window.addEventListener('keydown', (e) => {
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          this.togglePlay();
          break;
        case 's':
        case 'ArrowRight':
          e.preventDefault();
          this.step();
          break;
        case 'u':
          this.undo();
          break;
        case 'c':
          this.follow = true;
          break;
      }
    });
  }
}
