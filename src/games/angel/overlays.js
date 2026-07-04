// Overlay computations, kept pure and DOM-free. The view caches results and
// invalidates them whenever the game state version changes.

import { pack, unpackX, unpackY } from '../../core/grid.js';

/**
 * Reachable frontier: cells the angel can reach in 1..maxDepth moves,
 * ignoring future devil blocks. BFS over Chebyshev balls minus blocked
 * cells - walls the angel cannot pass around show up as holes.
 * Returns Map<packedKey, depth>.
 */
export function computeFrontier(state, maxDepth = 3) {
  const p = state.power;
  const depths = new Map();
  const seen = new Set([pack(state.angel.x, state.angel.y)]);
  let level = [state.angel];
  for (let d = 1; d <= maxDepth; d++) {
    const next = [];
    for (const c of level) {
      for (let dx = -p; dx <= p; dx++) {
        for (let dy = -p; dy <= p; dy++) {
          if (dx === 0 && dy === 0) continue;
          const x = c.x + dx;
          const y = c.y + dy;
          const k = pack(x, y);
          if (seen.has(k)) continue;
          seen.add(k);
          if (state.blocked.has(k)) continue;
          depths.set(k, d);
          next.push({ x, y });
        }
      }
    }
    level = next;
  }
  return depths;
}

/**
 * Devil territory: the 1-cell dilation of all blocked cells - the region the
 * devil's structure dominates. Includes blocked keys; the view skips those
 * at draw time.
 */
export function computeTerritory(state) {
  const t = new Set();
  for (const k of state.blocked.keys()) {
    const x = unpackX(k);
    const y = unpackY(k);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        t.add(pack(x + dx, y + dy));
      }
    }
  }
  return t;
}

/** The angel's path as an array of cell coordinates, oldest first. */
export function computeTrail(state) {
  const pts = [{ x: 0, y: 0 }];
  for (const m of state.moves) {
    if (m.t === 'a') pts.push({ x: m.x, y: m.y });
  }
  return pts;
}
