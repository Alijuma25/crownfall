// ============================================================
// CROWNFALL — GameState.js
// State factory + shallow clone helpers.
// ============================================================

import {
  PIECE_TEMPLATES,
  ENTRY_POINTS,
  COLOR_ZONES,
  PHASES,
  PIECE_STATUS,
} from './constants.js';

/**
 * Create a fresh game state for a set of players.
 *
 * @param {Array<{id, name, color}>} players
 * @returns {object} GameState
 */
export function createGameState(players) {
  const state = {
    phase: PHASES.WAITING,
    activePlayerId: null,
    bonusTurnQueue: 0,
    currentDice: null,
    assignments: {},
    log: [],
    winner: null,
    players: {},
    pieces: {},
    empires: {},
    turnOrder: [], // player IDs in clockwise turn order
  };

  for (const { id, name, color } of players) {
    state.players[id] = {
      id,
      name,
      color,
      alive: true,
      controlledEmpires: [],
    };

    state.empires[id] = {
      homeControlledBy: id,
      colorZone: COLOR_ZONES[color],
      entryPoint: ENTRY_POINTS[color],
    };

    // Create pieces
    for (const template of PIECE_TEMPLATES) {
      const pieceId = `${id}_${template.suffix}`;
      state.pieces[pieceId] = {
        id: pieceId,
        ownerId: id,
        controllerId: id,
        type: template.type,
        status: PIECE_STATUS.HOME,
        position: null,
      };
    }

    state.turnOrder.push(id);
  }

  return state;
}

/**
 * Deep clone state (for immutable history if needed).
 * Uses JSON round-trip — adequate for our data model.
 */
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Append a structured log entry (max 200 entries).
 * @param {object} state
 * @param {string} message  Human-readable text
 * @param {string} category Event category for client styling (roll|move|kill|kill_general|prisoner|liberation|empire|eliminated|bonus|retreat|turn|system|winner)
 */
export function appendLog(state, message, category = 'system') {
  state.log.push({
    text: message,
    category,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  });
  if (state.log.length > 200) state.log.shift();
}

/**
 * Get the index of the current active player in turnOrder.
 */
export function activePlayerIndex(state) {
  return state.turnOrder.indexOf(state.activePlayerId);
}

/**
 * Advance to the next player who still has at least one surviving original piece
 * (ownerId === their id, status !== DEAD).
 *
 * This includes:
 *  - Players with a living General controlling their own pieces.
 *  - Players whose General died but still have pieces alive —
 *    even if those pieces are currently imprisoned by someone else.
 *    They still get a turn so they can attempt to escape (roll a 4).
 *
 * A player is only skipped when ALL of their original pieces are DEAD.
 */
export function advanceTurn(state) {
  const order = state.turnOrder;
  const n = order.length;
  let idx = activePlayerIndex(state);

  for (let i = 1; i <= n; i++) {
    const nextIdx = (idx + i) % n;
    const nextId  = order[nextIdx];
    // Player gets a turn if any of their original pieces is still alive
    const hasOwnPieces = Object.values(state.pieces).some(
      p => p.ownerId === nextId && p.status !== PIECE_STATUS.DEAD
    );
    if (hasOwnPieces) {
      state.activePlayerId = nextId;
      return;
    }
  }
  // No player found — game should already be over
}

/**
 * Get living players array.
 */
export function livingPlayers(state) {
  return Object.values(state.players).filter(p => p.alive);
}
