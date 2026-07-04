# Outrun

A browser-based simulation of [Conway's Angel Problem](https://en.wikipedia.org/wiki/Angel_problem), built as an interactive laboratory for infinite-grid systems. Dark, minimal, and canvas-rendered.

## The game

- Infinite square lattice. The Angel starts at the origin with power *p*.
- Each round the **Devil moves first**, permanently blocking any unblocked square except the one under the Angel.
- The **Angel** then moves to any unblocked square within Chebyshev distance *p* - it flies over blocked squares but may not land on them, and it must move.
- The Devil wins if the Angel has no legal destination. The Angel "wins" by surviving forever, so the HUD tracks rounds survived.

## Running locally

```sh
npm install
npm run dev       # dev server
npm test          # headless engine self-tests (Node, no browser needed)
npm run build     # production build into dist/
npm run preview   # serve the production build
```

## Controls

| Input | Action |
| --- | --- |
| drag | pan |
| wheel / pinch | zoom |
| click | play your half-move (when a human is up) |
| `space` | play / pause |
| `s` / `→` | step one ply |
| `u` | undo one ply |
| `c` | recenter camera on the Angel |

Set either side to **Human** or an AI in the strategy dropdowns - Human vs Human, Human vs AI (either seat), or AI vs AI. Strategy swaps apply from the next ply; changing power starts a fresh game.

## Architecture

```
src/
  core/            engine-agnostic: rng, sparse grid keys, camera, renderer
  engine/          game registry (the pluggable-game interface)
  games/angel/     rules (pure), game orchestration, AI strategies, overlay computations, canvas view
  ui/              control panel + HUD
  app.js           loop, playback, input
```

- **Sparse storage** - blocked cells live in a `Map` keyed by packed integers (`x * 2²⁶ + y`); nothing is ever allocated for empty space.
- **Visible-only rendering** - the checkerboard is a single transformed pattern fill; every paint pass culls against the visible cell bounds, and cell iteration switches to range-scanning when the blocked set outgrows the viewport.
- **Pure rules** - `games/angel/rules.js` has no DOM dependencies, so the exact shipped code runs in the Node self-test.
- **Deterministic engine** - every random decision flows through one seeded PRNG owned by the game, and its state is snapshotted per ply so undo rewinds randomness too. Seeding is internal (not exposed in the UI); `npm test` proves same-seed games produce identical move logs.

### AI strategies

Strategies are interchangeable objects - `{ id, name, roles, choose(state, rng) }` - registered in `games/angel/strategies.js`:

- **Devils:** wall builder (fences snapped ahead of the Angel's heading, then a minimax squeeze once the fence is complete) · enclosure ring
- **Angels:** freedom maximizer · runner (potential-field repulsion from blocked cells)

Future agents (MCTS, minimax, RL) implement the same interface and appear in the dropdowns automatically. All randomness must come from the passed `rng` to preserve reproducibility.

### Adding another grid system

The Angel Problem is one registered game. To host Langton's Ant, Life, Wireworld, etc., register the same shape in `src/engine/registry.js` terms: `create`, `createView` (contributes a renderer paint pass), `clickAction`, and a strategy map if the system has agents. The camera, renderer, playback, and panel shell are already game-agnostic.

### License

Open
