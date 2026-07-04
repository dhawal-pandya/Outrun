// Game orchestration: owns the state, the seeded RNG, and undo history.
// Every game is internally seeded (callers may pass config.seed - the
// self-tests do, to prove reproducibility) and the RNG state is snapshotted
// before every half-move so undo rewinds randomness too.

import { RNG, hashSeed } from '../../core/rng.js';
import * as rules from './rules.js';
import { strategies } from './strategies.js';

export class AngelGame {
  constructor(config) {
    const seed = config.seed ?? Math.random().toString(36).slice(2, 10);
    this.config = { ...config, seed };
    this.state = rules.createState(config.power);
    this.rng = new RNG(hashSeed(String(seed)));
    this.history = []; // rng state before each applied move
    this.listeners = new Set();
  }

  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(ev) {
    for (const fn of this.listeners) fn(ev);
  }

  strategyFor(role) {
    return strategies.get(role === 'devil' ? this.config.devil : this.config.angel);
  }

  currentIsHuman() {
    const s = this.strategyFor(this.state.ply);
    return !s || !!s.human;
  }

  /** Apply a move (from a human or an AI). Throws if illegal. */
  act(move) {
    this.history.push(this.rng.getState());
    rules.applyMove(this.state, move);
    this.emit(move);
    return move;
  }

  /** Let the current AI actor take its half-move. Null if human/over. */
  stepAI() {
    if (this.state.result || this.currentIsHuman()) return null;
    const strat = this.strategyFor(this.state.ply);
    const choice = strat.choose(this.state, this.rng);
    if (!choice) return null;
    const t = this.state.ply === 'devil' ? 'b' : 'a';
    return this.act({ t, x: choice.x, y: choice.y });
  }

  undo() {
    const undone = rules.undoMove(this.state);
    if (!undone) return null;
    const rs = this.history.pop();
    if (rs !== undefined) this.rng.setState(rs);
    this.emit({ t: 'undo', undone });
    return undone;
  }
}
