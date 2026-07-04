// Interchangeable AI strategies. A strategy is a plain object:
//
//   { id, name, roles: ['angel'|'devil'], choose(state, rng) -> {x, y} }
//
// "Human" is a sentinel strategy (human: true) - the app waits for board
// clicks instead of calling choose(). All randomness must come from the
// passed rng so the engine stays reproducible. Future strategies (MCTS,
// minimax, RL agents) register the same way and appear in the dropdowns.

import { pack, chebyshev } from '../../core/grid.js';
import * as rules from './rules.js';

export const strategies = new Map();

function register(def) {
  strategies.set(def.id, def);
  return def;
}

export function strategiesForRole(role) {
  return [...strategies.values()].filter((s) => s.roles.includes(role));
}

// ---------------------------------------------------------------- helpers

/**
 * Recent direction of angel travel as a unit vector, decayed over the last
 * few moves. Derived purely from state so strategies stay stateless (and
 * therefore deterministic).
 */
export function angelHeading(state) {
  let hx = 0;
  let hy = 0;
  let seen = 0;
  for (let i = state.moves.length; i-- > 0 && seen < 8; ) {
    const m = state.moves[i];
    if (m.t !== 'a') continue;
    const decay = Math.pow(0.7, seen);
    hx += (m.x - m.fx) * decay;
    hy += (m.y - m.fy) * decay;
    seen++;
  }
  const len = Math.hypot(hx, hy);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: hx / len, y: hy / len };
}

/** Blocked cells within Chebyshev radius r of (cx, cy), via box scan. */
function blockedNear(state, cx, cy, r) {
  const out = [];
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const x = cx + dx;
      const y = cy + dy;
      if (state.blocked.has(pack(x, y))) out.push({ x, y });
    }
  }
  return out;
}

/** Unblocked cells (≠ center) within Chebyshev p of (cx, cy). */
function freedomAt(state, cx, cy, p) {
  let f = 0;
  for (let dx = -p; dx <= p; dx++) {
    for (let dy = -p; dy <= p; dy++) {
      if (dx === 0 && dy === 0) continue;
      if (!state.blocked.has(pack(cx + dx, cy + dy))) f++;
    }
  }
  return f;
}

/** Deterministic outward spiral to the first blockable cell. Always finds
 * one on an infinite board, so devils never fail to move. */
function fallbackBlock(state) {
  const a = state.angel;
  for (let r = 1; r < 10000; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (const dy of dx === -r || dx === r ? range(-r, r) : [-r, r]) {
        if (rules.canBlock(state, a.x + dx, a.y + dy)) {
          return { x: a.x + dx, y: a.y + dy };
        }
      }
    }
  }
  return null;
}

/**
 * 1-ply minimax squeeze: block the angel destination that minimizes the
 * angel's best remaining freedom. Not registered as a mode of its own (it
 * just chases the angel forever) - the wall builder uses it once its fence
 * is complete and it is time to close the trap.
 */
function greedyBlock(state) {
  const p = state.power;
  const a = state.angel;
  const moves = rules.legalAngelMoves(state);
  if (moves.length === 0) return fallbackBlock(state);
  const h = angelHeading(state);
  const px = a.x + h.x * (p + 1);
  const py = a.y + h.y * (p + 1);

  const freedom = moves.map((m) => freedomAt(state, m.x, m.y, p));

  let best = null;
  let bestScore = Infinity;
  for (let c = 0; c < moves.length; c++) {
    const cand = moves[c];
    let worst = -1; // angel's best option if cand gets blocked
    for (let i = 0; i < moves.length; i++) {
      if (i === c) continue;
      const f =
        freedom[i] -
        (chebyshev(moves[i].x, moves[i].y, cand.x, cand.y) <= p ? 1 : 0);
      if (f > worst) worst = f;
    }
    const dx = cand.x - px;
    const dy = cand.y - py;
    const score = worst * 10000 + Math.hypot(dx, dy);
    if (score < bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best ? { x: best.x, y: best.y } : fallbackBlock(state);
}

function range(a, b) {
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

// ------------------------------------------------------------------ human

register({ id: 'human', name: 'Human', human: true, roles: ['angel', 'devil'] });

// ----------------------------------------------------------------- devils

register({
  id: 'devil-wall',
  name: 'Wall builder',
  roles: ['devil'],
  // Builds a fence across the angel's direction of travel. The wall line is
  // snapped to multiples of Q so it stays put while the angel approaches
  // (recomputing from the angel's position every turn would smear the wall).
  choose(state, rng) {
    const p = state.power;
    const a = state.angel;
    const h = angelHeading(state);
    const Q = 4 * p + 8;
    const margin = p + 2;

    const alongX = Math.abs(h.x) >= Math.abs(h.y);
    const s = alongX ? Math.sign(h.x) || 1 : Math.sign(h.y) || 1;

    let wall;
    let refCross;
    if (alongX) {
      wall = s > 0 ? Math.ceil((a.x + margin) / Q) * Q : Math.floor((a.x - margin) / Q) * Q;
      const dist = Math.abs(wall - a.x);
      const drift = Math.abs(h.x) > 0.05 ? (h.y / Math.abs(h.x)) * dist : 0;
      refCross = dist <= margin + 1 ? a.y : Math.round(a.y + drift);
    } else {
      wall = s > 0 ? Math.ceil((a.y + margin) / Q) * Q : Math.floor((a.y - margin) / Q) * Q;
      const dist = Math.abs(wall - a.y);
      const drift = Math.abs(h.y) > 0.05 ? (h.x / Math.abs(h.y)) * dist : 0;
      refCross = dist <= margin + 1 ? a.x : Math.round(a.x + drift);
    }

    const L = Q + 2 * p; // fence half-length
    for (let k = 0; k <= L; k++) {
      const offsets = k === 0 ? [0] : [-k, k];
      for (const off of offsets) {
        const x = alongX ? wall : refCross + off;
        const y = alongX ? refCross + off : wall;
        if (rules.canBlock(state, x, y)) return { x, y };
      }
    }
    // Fence is complete - squeeze the angel directly.
    return greedyBlock(state);
  },
});

register({
  id: 'devil-ring',
  name: 'Enclosure ring',
  roles: ['devil'],
  // Blocks on the square ring at radius r around the angel, preferring the
  // arc in front of its heading - paints enclosing arcs as the angel turns.
  choose(state, rng) {
    const p = state.power;
    const a = state.angel;
    const h = angelHeading(state);
    for (let r = 2 * p + 5; r <= 2 * p + 11; r++) {
      const fx = a.x + h.x * r;
      const fy = a.y + h.y * r;
      let best = null;
      let bd = Infinity;
      const consider = (x, y) => {
        if (!rules.canBlock(state, x, y)) return;
        const d = (x - fx) * (x - fx) + (y - fy) * (y - fy);
        if (d < bd) {
          bd = d;
          best = { x, y };
        }
      };
      for (let dx = -r; dx <= r; dx++) {
        consider(a.x + dx, a.y - r);
        consider(a.x + dx, a.y + r);
      }
      for (let dy = -r + 1; dy <= r - 1; dy++) {
        consider(a.x - r, a.y + dy);
        consider(a.x + r, a.y + dy);
      }
      if (best) return best;
    }
    return fallbackBlock(state);
  },
});

// ----------------------------------------------------------------- angels

register({
  id: 'angel-free',
  name: 'Freedom maximizer',
  roles: ['angel'],
  // Moves where the next turn has the most options, breaking ties away from
  // walls and along its current heading.
  choose(state, rng) {
    const p = state.power;
    const a = state.angel;
    const moves = rules.legalAngelMoves(state);
    if (!moves.length) return null;
    const h = angelHeading(state);
    let best = null;
    let bs = -Infinity;
    for (const m of moves) {
      const freedom = freedomAt(state, m.x, m.y, p);
      let nearest = p + 4;
      outer: for (let r = 1; r <= p + 3; r++) {
        for (let dx = -r; dx <= r; dx++) {
          for (const dy of dx === -r || dx === r ? range(-r, r) : [-r, r]) {
            if (state.blocked.has(pack(m.x + dx, m.y + dy))) {
              nearest = r;
              break outer;
            }
          }
        }
      }
      const mom = ((m.x - a.x) * h.x + (m.y - a.y) * h.y) / Math.max(1, p);
      const score = freedom * 100 + nearest * 12 + mom * 6 + rng.next();
      if (score > bs) {
        bs = score;
        best = m;
      }
    }
    return { x: best.x, y: best.y };
  },
});

register({
  id: 'angel-runner',
  name: 'Runner (potential field)',
  roles: ['angel'],
  // Treats every nearby blocked cell as a repulsor and keeps momentum, so it
  // flees dense devil territory in long straight lines.
  choose(state, rng) {
    const p = state.power;
    const a = state.angel;
    const moves = rules.legalAngelMoves(state);
    if (!moves.length) return null;
    const R = 3 * p + 6;
    const near = blockedNear(state, a.x, a.y, R + p);
    const h = angelHeading(state);
    let best = null;
    let bs = -Infinity;
    for (const m of moves) {
      let danger = 0;
      for (const b of near) {
        danger += 1 / (0.5 + chebyshev(m.x, m.y, b.x, b.y));
      }
      const mom = ((m.x - a.x) * h.x + (m.y - a.y) * h.y) / Math.max(1, p);
      const score = -danger * 24 + mom * 4 + rng.next() * 0.5;
      if (score > bs) {
        bs = score;
        best = m;
      }
    }
    return { x: best.x, y: best.y };
  },
});
