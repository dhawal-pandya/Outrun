// Pure rules of Conway's Angel Problem. No DOM, no rendering - these run
// unchanged in the browser and in the Node self-test.
//
// Official formulation implemented here:
//   - Infinite square lattice, Angel starts at the origin with power p.
//   - The Devil moves first each round and permanently blocks any unblocked
//     square except the Angel's current square (anywhere on the lattice).
//   - The Angel then moves to any unblocked square at Chebyshev distance
//     1..p from its position. It flies over blocked squares freely but may
//     not land on one, and it must move.
//   - The Devil wins when the Angel has no legal destination. The Angel
//     "wins" by surviving forever, so the simulation tracks rounds survived.

import { pack, chebyshev } from '../../core/grid.js';

export { chebyshev };

export function createState(power) {
  return {
    power,
    angel: { x: 0, y: 0 },
    blocked: new Map(), // packed key -> round the cell was blocked
    ply: 'devil', // whose half-move it is: 'devil' | 'angel'
    round: 1, // a round = one devil block + one angel move
    moves: [], // {t:'b',x,y} | {t:'a',x,y,fx,fy}
    result: null, // null | { winner:'devil', rounds }
  };
}

export function isBlocked(state, x, y) {
  return state.blocked.has(pack(x, y));
}

export function legalAngelMoves(state) {
  const { power, angel, blocked } = state;
  const out = [];
  for (let dx = -power; dx <= power; dx++) {
    for (let dy = -power; dy <= power; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = angel.x + dx;
      const y = angel.y + dy;
      if (!blocked.has(pack(x, y))) out.push({ x, y });
    }
  }
  return out;
}

export function canBlock(state, x, y) {
  return (
    !state.result &&
    state.ply === 'devil' &&
    !state.blocked.has(pack(x, y)) &&
    !(x === state.angel.x && y === state.angel.y)
  );
}

export function canMoveTo(state, x, y) {
  return (
    !state.result &&
    state.ply === 'angel' &&
    chebyshev(x, y, state.angel.x, state.angel.y) <= state.power &&
    !(x === state.angel.x && y === state.angel.y) &&
    !state.blocked.has(pack(x, y))
  );
}

/** Mutates state. Throws on illegal moves so bugs surface immediately. */
export function applyMove(state, move) {
  if (move.t === 'b') {
    if (!canBlock(state, move.x, move.y)) {
      throw new Error(`illegal block at ${move.x},${move.y}`);
    }
    state.blocked.set(pack(move.x, move.y), state.round);
    state.moves.push({ t: 'b', x: move.x, y: move.y });
    state.ply = 'angel';
    if (legalAngelMoves(state).length === 0) {
      state.result = { winner: 'devil', rounds: state.round };
    }
  } else if (move.t === 'a') {
    if (!canMoveTo(state, move.x, move.y)) {
      throw new Error(`illegal angel move to ${move.x},${move.y}`);
    }
    const fx = state.angel.x;
    const fy = state.angel.y;
    state.angel = { x: move.x, y: move.y };
    state.moves.push({ t: 'a', x: move.x, y: move.y, fx, fy });
    state.ply = 'devil';
    state.round += 1;
  } else {
    throw new Error(`unknown move type ${move.t}`);
  }
}

/** Reverts the last half-move. Returns the undone move, or null. */
export function undoMove(state) {
  const last = state.moves.pop();
  if (!last) return null;
  if (last.t === 'b') {
    state.blocked.delete(pack(last.x, last.y));
    state.ply = 'devil';
    state.result = null;
  } else {
    state.angel = { x: last.fx, y: last.fy };
    state.ply = 'angel';
    state.round -= 1;
  }
  return last;
}
