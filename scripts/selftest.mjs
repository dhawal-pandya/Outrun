// Headless engine self-test. The core and game modules are DOM-free, so the
// exact code that ships to the browser is exercised here in Node. Run by
// `npm test`, the pre-push hook, and the Pages deploy workflow.

import { pack, unpackX, unpackY } from '../src/core/grid.js';
import { RNG, hashSeed } from '../src/core/rng.js';
import * as rules from '../src/games/angel/rules.js';
import { strategies } from '../src/games/angel/strategies.js';
import { AngelGame } from '../src/games/angel/game.js';

let failures = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}`);
    console.error(`       ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function assertEqual(a, b, msg) {
  if (a !== b) throw new Error(`${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}

function runPlies(game, n) {
  for (let i = 0; i < n; i++) {
    if (game.state.result) break;
    if (!game.stepAI()) break;
  }
}

console.log('outrun selftest');

check('grid key packing round-trips', () => {
  const rng = new RNG(hashSeed('pack-test'));
  for (let i = 0; i < 20000; i++) {
    const x = rng.int(2_000_001) - 1_000_000;
    const y = rng.int(2_000_001) - 1_000_000;
    const k = pack(x, y);
    assertEqual(unpackX(k), x, `unpackX for (${x},${y})`);
    assertEqual(unpackY(k), y, `unpackY for (${x},${y})`);
  }
});

check('rng is reproducible and state round-trips', () => {
  const a = new RNG(hashSeed('seed'));
  const b = new RNG(hashSeed('seed'));
  for (let i = 0; i < 1000; i++) assertEqual(a.next(), b.next(), `draw ${i}`);
  const mid = a.getState();
  const x1 = a.next();
  a.setState(mid);
  assertEqual(a.next(), x1, 'state restore');
});

check('legal move geometry matches Chebyshev ball', () => {
  for (let p = 1; p <= 5; p++) {
    const st = rules.createState(p);
    assertEqual(rules.legalAngelMoves(st).length, (2 * p + 1) ** 2 - 1, `power ${p}`);
  }
});

check('devil traps a power-1 angel when the last exit is blocked', () => {
  const st = rules.createState(1);
  // Pre-fill 7 of the 8 neighbors, then block the last via the rules.
  const ring = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx || dy) ring.push([dx, dy]);
    }
  }
  for (const [dx, dy] of ring.slice(0, 7)) st.blocked.set(pack(dx, dy), 0);
  const [lx, ly] = ring[7];
  rules.applyMove(st, { t: 'b', x: lx, y: ly });
  assert(st.result && st.result.winner === 'devil', 'expected devil win');
  rules.undoMove(st);
  assert(st.result === null, 'undo should clear the result');
  assertEqual(st.ply, 'devil', 'undo should return the ply to the devil');
});

check('same seed and strategies give identical games', () => {
  const config = { power: 2, seed: 'determinism', angel: 'angel-free', devil: 'devil-wall' };
  const a = new AngelGame(config);
  const b = new AngelGame(config);
  runPlies(a, 300);
  runPlies(b, 300);
  assertEqual(
    JSON.stringify(a.state.moves),
    JSON.stringify(b.state.moves),
    'move logs diverged'
  );
  assertEqual(a.rng.getState(), b.rng.getState(), 'rng states diverged');
});

check('undo restores state and randomness exactly', () => {
  const g = new AngelGame({ power: 2, seed: 'undo-test', angel: 'angel-runner', devil: 'devil-ring' });
  runPlies(g, 60);
  const snap = {
    moves: g.state.moves.length,
    angel: { ...g.state.angel },
    blocked: g.state.blocked.size,
    ply: g.state.ply,
    round: g.state.round,
    rng: g.rng.getState(),
  };
  const before = JSON.stringify(g.state.moves);
  runPlies(g, 20);
  for (let i = 0; i < 20; i++) g.undo();
  assertEqual(g.state.moves.length, snap.moves, 'move count');
  assertEqual(g.state.angel.x, snap.angel.x, 'angel x');
  assertEqual(g.state.angel.y, snap.angel.y, 'angel y');
  assertEqual(g.state.blocked.size, snap.blocked, 'blocked count');
  assertEqual(g.state.ply, snap.ply, 'ply');
  assertEqual(g.state.round, snap.round, 'round');
  assertEqual(g.rng.getState(), snap.rng, 'rng state');
  assertEqual(JSON.stringify(g.state.moves), before, 'move log');
  // ...and the continuation after undo replays identically.
  runPlies(g, 20);
  const replayed = JSON.stringify(g.state.moves);
  for (let i = 0; i < 20; i++) g.undo();
  runPlies(g, 20);
  assertEqual(JSON.stringify(g.state.moves), replayed, 'post-undo continuation');
});

check('every AI pairing plays 200 legal plies', () => {
  const angels = [...strategies.values()].filter((s) => !s.human && s.roles.includes('angel'));
  const devils = [...strategies.values()].filter((s) => !s.human && s.roles.includes('devil'));
  for (const an of angels) {
    for (const dv of devils) {
      for (const power of [1, 3]) {
        // applyMove throws on any illegal move, so surviving is the assertion
        const g = new AngelGame({ power, seed: `pair-${an.id}-${dv.id}`, angel: an.id, devil: dv.id });
        runPlies(g, 200);
        assert(
          g.state.result !== null || g.state.moves.length === 200,
          `${an.id} vs ${dv.id} p${power} stalled at ${g.state.moves.length} plies`
        );
      }
    }
  }
});

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
