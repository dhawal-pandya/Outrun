// Control panel + HUD wiring. Pure DOM glue: reads config for the app,
// reflects app state back into the UI, never touches game internals.

export class Panel {
  constructor(app, root) {
    this.app = app;
    const $ = (sel) => root.querySelector(sel);
    this.el = {
      panel: $('#panel'),
      panelToggle: $('#panel-toggle'),
      panelOpen: $('#panel-open'),
      angelSel: $('#angel-strategy'),
      devilSel: $('#devil-strategy'),
      power: $('#power'),
      newGame: $('#new-game'),
      play: $('#play'),
      step: $('#step'),
      undo: $('#undo'),
      recenter: $('#recenter'),
      speed: $('#speed'),
      speedLabel: $('#speed-label'),
      status: $('#status'),
      metrics: $('#metrics'),
      banner: $('#banner'),
      bannerText: $('#banner-text'),
      bannerNew: $('#banner-new'),
      toast: $('#toast'),
    };
    this._hud = { status: '', metrics: '', play: '' };
    this._toastTimer = 0;

    this.populateStrategies();
    this.applySpeed();
    this.bind();
  }

  populateStrategies() {
    const fill = (sel, role, preferred) => {
      sel.innerHTML = '';
      for (const s of this.app.def.strategiesForRole(role)) {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.human ? 'Human' : `AI · ${s.name}`;
        sel.appendChild(opt);
      }
      sel.value = preferred;
    };
    fill(this.el.angelSel, 'angel', this.app.def.defaults.angel);
    fill(this.el.devilSel, 'devil', this.app.def.defaults.devil);
    this.el.power.value = String(this.app.def.defaults.power);
  }

  readConfig() {
    return {
      power: Number(this.el.power.value),
      angel: this.el.angelSel.value,
      devil: this.el.devilSel.value,
    };
  }

  applySpeed() {
    const v = Number(this.el.speed.value) / 100;
    const speed = 0.5 * Math.pow(60, v); // log scale: 0.5 .. 30 plies/sec
    this.app.speed = speed;
    this.el.speedLabel.textContent = speed >= 10 ? `${Math.round(speed)}/s` : `${speed.toFixed(1)}/s`;
  }

  bind() {
    const app = this.app;
    const click = (btn, fn) =>
      btn.addEventListener('click', () => {
        fn();
        btn.blur(); // keep space/shortcuts from re-triggering the button
      });

    click(this.el.newGame, () => app.newGame(this.readConfig()));
    click(this.el.bannerNew, () => app.newGame(this.readConfig()));
    click(this.el.play, () => app.togglePlay());
    click(this.el.step, () => app.step());
    click(this.el.undo, () => app.undo());
    click(this.el.recenter, () => {
      app.follow = true;
    });
    click(this.el.panelToggle, () => this.setCollapsed(true));
    click(this.el.panelOpen, () => this.setCollapsed(false));

    // Power changes define a different game - restart.
    this.el.power.addEventListener('change', () => app.newGame(this.readConfig()));

    // Strategy swaps take effect from the next ply - no restart needed.
    this.el.angelSel.addEventListener('change', () => {
      app.game.config.angel = this.el.angelSel.value;
    });
    this.el.devilSel.addEventListener('change', () => {
      app.game.config.devil = this.el.devilSel.value;
    });

    this.el.speed.addEventListener('input', () => this.applySpeed());

    for (const box of document.querySelectorAll('.opt')) {
      app.options[box.dataset.opt] = box.checked;
      box.addEventListener('change', () => {
        app.options[box.dataset.opt] = box.checked;
      });
    }
  }

  setCollapsed(collapsed) {
    this.el.panel.classList.toggle('collapsed', collapsed);
    this.el.panelOpen.hidden = !collapsed;
  }

  updateHUD() {
    const app = this.app;
    const st = app.game.state;

    let status;
    if (st.result) {
      status = `devil wins · angel trapped in round ${st.result.rounds}`;
    } else {
      const actor = st.ply === 'devil' ? 'devil' : 'angel';
      status = app.game.currentIsHuman()
        ? `round ${st.round} · your move: ${actor}`
        : `round ${st.round} · ${actor} to move`;
    }
    if (status !== this._hud.status) {
      this._hud.status = status;
      this.el.status.textContent = status;
    }

    const dist = Math.max(Math.abs(st.angel.x), Math.abs(st.angel.y));
    const metrics = `power ${st.power} · blocked ${st.blocked.size} · mobility ${app.view.mobility()} · dist ${dist}`;
    if (metrics !== this._hud.metrics) {
      this._hud.metrics = metrics;
      this.el.metrics.textContent = metrics;
    }

    const play = app.playing ? '⏸ Pause' : '▶ Play';
    if (play !== this._hud.play) {
      this._hud.play = play;
      this.el.play.textContent = play;
    }
  }

  showBanner(text) {
    this.el.bannerText.textContent = text;
    this.el.banner.hidden = false;
  }

  hideBanner() {
    this.el.banner.hidden = true;
  }

  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.hidden = false;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.el.toast.classList.remove('show');
      this.el.toast.hidden = true;
    }, 2400);
  }
}
