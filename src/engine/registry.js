// Game registry. The Angel Problem is one registered game; other infinite-grid
// systems (Langton's Ant, Life, Wireworld, ...) register the same shape:
//
// {
//   id, name,
//   strategies,                 // Map<id, strategy> of interchangeable agents
//   create(config),             // -> game instance (state + act/undo/step)
//   load(data),                 // -> game instance from serialized save
//   createView(app),            // -> view (registers its renderer paint pass)
//   clickAction(state, cell),   // -> move for a human click, or null
//   defaults,                   // default config for the UI
// }

export const games = new Map();

export function registerGame(def) {
  games.set(def.id, def);
  return def;
}
