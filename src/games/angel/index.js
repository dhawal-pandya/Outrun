// Registry glue: everything the generic app shell needs to host the
// Angel Problem as one pluggable game.

import { registerGame } from '../../engine/registry.js';
import { AngelGame } from './game.js';
import { AngelView } from './view.js';
import { strategies, strategiesForRole } from './strategies.js';
import * as rules from './rules.js';

export default registerGame({
  id: 'angel',
  name: "Conway's Angel Problem",
  strategies,
  strategiesForRole,
  create: (config) => new AngelGame(config),
  createView: (app) => new AngelView(app),
  clickAction(state, cell) {
    if (state.result) return null;
    if (state.ply === 'devil') {
      return rules.canBlock(state, cell.x, cell.y) ? { t: 'b', x: cell.x, y: cell.y } : null;
    }
    return rules.canMoveTo(state, cell.x, cell.y) ? { t: 'a', x: cell.x, y: cell.y } : null;
  },
  defaults: { power: 2, angel: 'angel-free', devil: 'devil-wall' },
});
