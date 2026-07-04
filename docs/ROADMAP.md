# Outrun Roadmap: Future Grid Systems

Outrun's thesis: one canvas, one effectively infinite sparse grid, deterministic seeded stepping, and pluggable simulations. Angel vs Devil is the first tenant. This doc maps each candidate system onto the existing engine, with a build path, a feasibility read, and an interest read.

Effort scale: **S** = about a day, **M** = a few days, **L** = a week or more.

| System | Effort | Engine fit | Visual appeal | Depth / research interest |
| --- | --- | --- | --- | --- |
| Angel vs Devil | shipped | native | high | high (open-problem lore, AI playground) |
| Game of Life | S | excellent | high | medium-high |
| Langton's Ant | S | excellent | high (hypnotic) | medium |
| Cellular automata (rule lab) | M | excellent | high | high (the "lab" identity) |
| Maze generation | S-M | very good | medium-high | medium (educational) |
| Wireworld | M | very good | medium-high | high (logic circuits) |
| Predator-prey ecosystems | M | good | medium-high | high (population dynamics) |
| Flocking (Boids) | M | partial (not a lattice) | very high | medium |

## Phase 0: generalize the shell (prerequisite, S)

The registry (`src/engine/registry.js`) is already game-agnostic, but `src/app.js` still assumes the Angel game in a few places. Before a second game lands:

1. **Step contract.** Replace direct `game.stepAI()` calls with a generic `game.step()` that advances one tick (a ply for Angel, a generation for a CA). Games without turn order just ignore the human-turn logic.
2. **Camera focus.** `view.angelPos()` becomes `view.focus(now)` returning the point the camera should follow, or null for "do not follow" (Life has no protagonist; default to free camera).
3. **Per-game panel sections.** Each game def contributes its own controls (Angel: strategies + power; Life: rule string + paint mode) and its own overlay list. The playback row, speed slider, and HUD chips stay shared.
4. **Game selector.** A dropdown at the top of the panel, populated from the registry, swapping the active def.
5. **Step batching.** The speed slider currently tops out at 30 plies/sec. CA systems want thousands of steps per second (Langton's Ant needs ~10,000 steps to reach its highway). Let a game def declare `batchable: true` so the loop can run many steps per frame and only paint once.

Everything below assumes Phase 0 is done. Each new game then follows the Angel layout: `src/games/<id>/{rules,game,view,index}.js` plus a section in `scripts/selftest.mjs`.

## Angel vs Devil (shipped)

The reference implementation. Future work here is strategy depth, not plumbing: an MCTS or minimax devil behind the same `{ id, name, roles, choose(state, rng) }` interface, and, most interestingly, Kloster's proven power-2 angel strategy, which would let the site demo an actual theorem instead of heuristics.

- **Feasibility:** the interfaces already exist; MCTS needs a fast state clone (S-M). Kloster's strategy is intricate but published (M).
- **Interest:** high. "Watch a proven-unkillable angel outrun every devil" is a genuinely unique demo.

## Game of Life

- **Path:** state is a `Set` of live-cell keys (the packed-integer trick from `src/core/grid.js` as-is). One step: count neighbors by iterating live cells and their 8 neighbors into a `Map<key, count>`, then apply B3/S23. View paints live cells with the existing culling pattern; reuse the block fade-in for births. Click-to-paint replaces `clickAction`. Ship a small pattern library (glider, LWSS, Gosper gun, R-pentomino) stamped at the cursor.
- **Feasibility:** S. The sparse-set update is textbook and every rendering piece already exists. The infinite grid is a real differentiator: most web Life demos are finite, so gliders die at walls; here a Gosper gun runs forever with the camera chasing its stream.
- **Interest:** high appeal, universally recognized, and the perfect first tenant to prove the multi-game engine. Overlays: cell age as color, births/deaths flash, population count in the HUD.

## Langton's Ant

- **Path:** state is `{ants: [{x, y, dir}], flipped: Set}`. A step is ~5 lines of rules. Support multiple ants (fun interactions) and turmite rule strings later. Camera follows the ant (the existing follow-glide works verbatim). Trail overlay already exists conceptually.
- **Feasibility:** S, the smallest possible tenant, but it is the forcing function for step batching (Phase 0.5): the famous emergent highway appears after ~10,000 steps, so the UI needs a "fast forward" that runs thousands of steps per frame.
- **Interest:** medium on paper, high in practice; the chaos-then-highway transition is hypnotic and makes a great default autoplay. Strong pairing with the deterministic engine: same start, same highway, every time.

## Cellular automata (general rule lab)

- **Path:** generalize Life into a rule-driven engine: cells carry a small integer state, rules are `B.../S...` strings (Life-like), plus "Generations" rules for decaying states (Brian's Brain: B2/S/3). Panel gets a rule input, a preset dropdown (Seeds, Day & Night, Maze, Brian's Brain), and a "random rule" button that flows through the seeded RNG so discoveries are reproducible.
- **Feasibility:** M. It is Life plus a rule parser and an n-state palette; build Life first, then refactor it into this engine so Life becomes preset number one.
- **Interest:** high, and the best expression of the project's "interactive research laboratory" framing. Random-rule exploration with deterministic replays is exactly the lab loop: find something weird, share the rule string, anyone reproduces it.

## Maze generation

- **Path:** treat walls as blocked cells (the Angel's `blocked` map, verbatim). Animate growing algorithms: recursive backtracker, Prim, Kruskal, and Wilson (loop-erased random walks, the most mesmerizing to watch). Each is a strategy behind the existing interchangeable-strategy interface, so the dropdown compares algorithms. Phase two: solving overlays (BFS flood fill reusing the heat-map rendering, then A*) racing through the finished maze.
- **Feasibility:** S-M. Bounded mazes are trivial for this engine; an infinite chunk-by-chunk lazy maze is a stretch goal that fits the infinite-grid thesis nicely (Eller's algorithm generates row by row forever).
- **Interest:** medium-high. Very watchable, very teachable (algorithm comparison side by side is a classic CS-education artifact), and the generation-then-solving arc gives it a narrative that pure CA lack.

## Wireworld

- **Path:** four cell states (empty, conductor, electron head, electron tail) in a `Map<key, state>`. The step rule is three lines. The real work is editing: a palette to draw conductors and place electrons, drag-to-draw lines, and a pattern library (diodes, OR/AND/XOR gates, clock loops, up to a binary adder).
- **Feasibility:** M. Simulation is trivial; the editor tooling and curated pattern library are the effort. The zoom range already supports both circuit-level and board-level views.
- **Interest:** high for the engineering-minded audience: watching electrons compute through gates you drew is the strongest "I built a computer out of cells" payoff of any system here. Slightly narrower casual appeal than Life.

## Predator-prey ecosystems

- **Path:** Wa-Tor-style agents on the grid: prey breed on a timer; predators carry energy, eat adjacent prey, starve at zero. State is `Map<key, agent>`; a step scans agents in seeded-shuffled order (determinism preserved through the game RNG, which the engine already mandates). New overlay type: a small time-series chart of the two populations to show the Lotka-Volterra oscillations, which becomes a reusable widget for any future system with metrics.
- **Feasibility:** M. Nothing hard, but it has the most moving parts so far: per-agent state, birth/death bookkeeping, tuning so the ecosystem neither instantly collapses nor explodes. Classically toroidal; here, either run it in a soft-bounded region or let it expand and follow the frontier.
- **Interest:** high. Emergent boom-bust cycles, extinction events, and spiral waves of predation are the most "living" thing the site would host, and parameter sliders make it a genuine experimentation sandbox.

## Flocking (Boids)

- **Path:** the honest outlier: boids live in continuous space, not on the lattice. The camera, renderer loop, playback, speed control, and panel shell all apply unchanged; the grid appears only as a spatial hash (coarse buckets keyed with the same packed-integer scheme) for O(1) neighbor queries. Separation/alignment/cohesion with sliders, obstacle painting on the grid (reusing blocked-cell rendering) so the two worlds interact, and optionally a predator boid.
- **Feasibility:** M. The algorithm is a page of vector math; determinism holds if every random nudge flows through the game RNG. It bends the "grid lab" thesis, but the engine core (camera + culled canvas + deterministic loop) was never actually grid-specific.
- **Interest:** very high visually, the best pure eye candy on this list and the strongest homepage material. Research depth is lower than the CA family unless parameter sweeps and emergent-metric overlays (polarization, group count) are added, which the panel pattern makes cheap.

## Suggested order

1. **Phase 0** shell generalization, proven by shipping **Game of Life** the same week.
2. **Langton's Ant**, which forces step batching and is nearly free afterward.
3. **Cellular automata rule lab**, absorbing Life as its first preset; this is the identity milestone.
4. **Maze generation**, first system with a beginning-middle-end narrative and shared solving overlays.
5. **Wireworld**, building the editor tooling that any future hand-authored system reuses.
6. **Predator-prey**, introducing agents-with-state and the time-series overlay widget.
7. **Boids** last: maximum spectacle, and by then the engine's non-grid seams (continuous positions, spatial hash) are worth formalizing.
